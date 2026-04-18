import { DAV_ALLOW, DAV_HEADERS, DIRECTORY_MARKER } from "./constants";
import { isAuthorizedForApp, unauthorizedWebDav } from "./security";
import type { AppAccess, Env, Resource } from "./types";

export async function handleWebDavRequest(
  request: Request,
  env: Env,
  url: URL,
  access: AppAccess,
  logicalPath: string,
): Promise<Response> {
  if (!(await isAuthorizedForApp(request, access))) {
    return unauthorizedWebDav(access.appName);
  }

  switch (request.method) {
    case "OPTIONS":
      return new Response(null, { status: 204, headers: baseHeaders() });
    case "PROPFIND":
      return handlePropfind(request, env, url, access, logicalPath);
    case "MKCOL":
      return handleMkcol(env, logicalPath, access);
    case "PUT":
      return handlePut(request, env, logicalPath, access);
    case "GET":
      return handleGet(request, env, logicalPath, access);
    case "HEAD":
      return handleHead(env, logicalPath, access);
    case "DELETE":
      return handleDelete(env, logicalPath, access);
    case "COPY":
    case "MOVE":
      return handleCopyMove(request, env, url, access, logicalPath);
    default:
      return methodNotAllowed();
  }
}

export function baseHeaders(extra: HeadersInit = {}): Headers {
  return new Headers({ ...DAV_HEADERS, ...extra });
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed.", {
    status: 405,
    headers: baseHeaders(),
  });
}

function decodePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  return parts.map((part) => decodeURIComponent(part)).join("/");
}

function normalizeKey(pathname: string, forceCollection = false): string {
  const decoded = decodePath(pathname);
  if (!decoded) {
    return "";
  }
  if (forceCollection || pathname.endsWith("/")) {
    return `${stripTrailingSlash(decoded)}/`;
  }
  return decoded;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function collectionPrefix(key: string): string {
  if (!key) {
    return "";
  }
  return key.endsWith("/") ? key : `${key}/`;
}

function isDirectoryMarker(key: string): boolean {
  return key.endsWith(`/${DIRECTORY_MARKER}`);
}

function parentCollectionKey(key: string): string {
  const normalized = stripTrailingSlash(key);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex < 0) {
    return "";
  }
  return `${normalized.slice(0, slashIndex)}/`;
}

function encodeHref(origin: string, basePath: string, key: string, isCollection: boolean): string {
  const normalized = stripTrailingSlash(key);
  const encodedPath = normalized
    ? normalized
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    : "";

  const fullPath = encodedPath ? `${basePath}/${encodedPath}` : basePath;
  return `${origin}${isCollection ? `${fullPath}/` : fullPath}`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function logicalToStorageKey(access: AppAccess, logicalKey: string): string {
  return `${access.rootPrefix}${logicalKey}`;
}

function logicalCollectionToStoragePrefix(access: AppAccess, logicalCollectionKey: string): string {
  if (!logicalCollectionKey) {
    return access.rootPrefix;
  }
  return logicalToStorageKey(access, collectionPrefix(logicalCollectionKey));
}

function storageCollectionMarkerKey(access: AppAccess, logicalCollectionKey: string): string | null {
  const storageCollectionKey = logicalCollectionToStoragePrefix(access, logicalCollectionKey);
  if (!storageCollectionKey) {
    return null;
  }
  return `${stripTrailingSlash(storageCollectionKey)}/${DIRECTORY_MARKER}`;
}

function storageToLogicalKey(access: AppAccess, storageKey: string): string {
  return storageKey.startsWith(access.rootPrefix) ? storageKey.slice(access.rootPrefix.length) : storageKey;
}

async function getResource(env: Env, logicalPath: string, access: AppAccess): Promise<Resource | null> {
  const fileKey = normalizeKey(logicalPath, false);
  if (!fileKey) {
    return { kind: "collection", key: "" };
  }

  if (!logicalPath.endsWith("/")) {
    const file = await env.WEBDAV_BUCKET.head(logicalToStorageKey(access, fileKey));
    if (file) {
      return { kind: "file", key: fileKey, object: file };
    }
  }

  const collectionKey = normalizeKey(logicalPath, true);
  const markerKey = storageCollectionMarkerKey(access, collectionKey);
  const marker = markerKey ? await env.WEBDAV_BUCKET.head(markerKey) : null;
  if (marker) {
    return { kind: "collection", key: collectionKey, marker };
  }

  const listing = await env.WEBDAV_BUCKET.list({
    prefix: logicalCollectionToStoragePrefix(access, collectionKey),
    limit: 1,
  });
  if (listing.objects.length > 0 || listing.delimitedPrefixes.length > 0) {
    return { kind: "collection", key: collectionKey, marker: null };
  }

  return null;
}

async function handleMkcol(env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  const key = normalizeKey(logicalPath, true);
  if (!key) {
    return new Response("Cannot create the root collection.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const existing = await getResource(env, logicalPath, access);
  if (existing) {
    return new Response("Collection already exists.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const parentKey = parentCollectionKey(key);
  if (!(await collectionExistsByKey(env, access, parentKey))) {
    return new Response("Parent collection does not exist.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  const markerKey = storageCollectionMarkerKey(access, key);
  if (markerKey) {
    await env.WEBDAV_BUCKET.put(markerKey, "");
  }
  return new Response(null, { status: 201, headers: baseHeaders() });
}

async function handlePut(request: Request, env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  if (logicalPath.endsWith("/")) {
    return new Response("PUT cannot target a collection path.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const key = normalizeKey(logicalPath, false);
  if (!key) {
    return new Response("Cannot PUT to the root collection.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const parentKey = parentCollectionKey(key);
  if (!(await collectionExistsByKey(env, access, parentKey))) {
    return new Response("Parent collection does not exist.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  const storageKey = logicalToStorageKey(access, key);
  const existing = await env.WEBDAV_BUCKET.head(storageKey);
  await env.WEBDAV_BUCKET.put(storageKey, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") ?? undefined,
      contentDisposition: request.headers.get("content-disposition") ?? undefined,
      cacheControl: request.headers.get("cache-control") ?? undefined,
      contentEncoding: request.headers.get("content-encoding") ?? undefined,
      contentLanguage: request.headers.get("content-language") ?? undefined,
    },
  });

  return new Response(null, {
    status: existing ? 204 : 201,
    headers: baseHeaders(),
  });
}

async function handleGet(request: Request, env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  const resource = await getResource(env, logicalPath, access);
  if (!resource) {
    return new Response("Not found.", { status: 404, headers: baseHeaders() });
  }

  if (resource.kind === "collection") {
    if (resource.key === "") {
      return new Response(`WebDAV ready: ${access.appName}`, {
        status: 200,
        headers: baseHeaders({
          "Content-Type": "text/plain; charset=utf-8",
        }),
      });
    }

    return new Response("GET is not supported for collections.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const object = await env.WEBDAV_BUCKET.get(logicalToStorageKey(access, resource.key), {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) {
    return new Response("Not found.", { status: 404, headers: baseHeaders() });
  }

  if (!("body" in object) || !object.body) {
    const headers = baseHeaders({
      ETag: object.httpEtag,
    });
    object.writeHttpMetadata(headers);
    return new Response(null, { status: 304, headers });
  }

  const headers = baseHeaders({
    ETag: object.httpEtag,
    "Content-Length": String(object.size),
    "Last-Modified": object.uploaded.toUTCString(),
  });
  object.writeHttpMetadata(headers);

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

async function handleHead(env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  const resource = await getResource(env, logicalPath, access);
  if (!resource) {
    return new Response(null, { status: 404, headers: baseHeaders() });
  }

  if (resource.kind === "collection") {
    return new Response(null, {
      status: 200,
      headers: baseHeaders({
        "Content-Length": "0",
      }),
    });
  }

  const headers = baseHeaders({
    ETag: resource.object.httpEtag,
    "Content-Length": String(resource.object.size),
    "Last-Modified": resource.object.uploaded.toUTCString(),
  });
  resource.object.writeHttpMetadata(headers);
  return new Response(null, { status: 200, headers });
}

async function handleDelete(env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  const resource = await getResource(env, logicalPath, access);
  if (!resource) {
    return new Response("Not found.", { status: 404, headers: baseHeaders() });
  }

  if (resource.kind === "collection" && resource.key === "") {
    return new Response("Cannot delete the root collection.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  if (resource.kind === "file") {
    await env.WEBDAV_BUCKET.delete(logicalToStorageKey(access, resource.key));
  } else {
    const keys = await collectStorageKeys(env, logicalCollectionToStoragePrefix(access, resource.key));
    if (keys.length > 0) {
      await deleteStorageKeysInBatches(env, keys);
    }
  }

  return new Response(null, { status: 204, headers: baseHeaders() });
}

async function handleCopyMove(
  request: Request,
  env: Env,
  url: URL,
  access: AppAccess,
  logicalPath: string,
): Promise<Response> {
  const source = await getResource(env, logicalPath, access);
  if (!source || (source.kind === "collection" && source.key === "")) {
    return new Response("Source not found.", { status: 404, headers: baseHeaders() });
  }

  const destinationHeader = request.headers.get("destination");
  if (!destinationHeader) {
    return new Response("Missing Destination header.", {
      status: 400,
      headers: baseHeaders(),
    });
  }

  const destinationUrl = new URL(destinationHeader, url);
  const destinationPath = parseDestinationPath(destinationUrl.pathname, access.basePath);
  if (!destinationPath) {
    return new Response("Destination must stay inside the same app URL.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  const destinationKey = normalizeKey(destinationPath, source.kind === "collection");
  if (!destinationKey || destinationKey === source.key) {
    return new Response("Invalid destination.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  if (source.kind === "collection" && destinationKey.startsWith(collectionPrefix(source.key))) {
    return new Response("Cannot move or copy a collection into itself.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  const destinationParent = parentCollectionKey(destinationKey);
  if (!(await collectionExistsByKey(env, access, destinationParent))) {
    return new Response("Destination parent collection does not exist.", {
      status: 409,
      headers: baseHeaders(),
    });
  }

  const overwrite = (request.headers.get("overwrite") ?? "T").toUpperCase() !== "F";
  const existingDestination = await getResource(env, destinationPath, access);
  if (existingDestination) {
    if (!overwrite) {
      return new Response("Destination exists and Overwrite is F.", {
        status: 412,
        headers: baseHeaders(),
      });
    }
    await deleteExistingResource(env, access, existingDestination);
  }

  if (source.kind === "file") {
    await copyFile(env, access, source.key, destinationKey);
  } else {
    await copyCollection(env, access, source.key, destinationKey);
  }

  if (request.method === "MOVE") {
    await deleteExistingResource(env, access, source);
  }

  return new Response(null, {
    status: existingDestination ? 204 : 201,
    headers: baseHeaders(),
  });
}

function parseDestinationPath(pathname: string, basePath: string): string | null {
  if (pathname === basePath) {
    return "/";
  }
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return null;
}

async function handlePropfind(
  request: Request,
  env: Env,
  url: URL,
  access: AppAccess,
  logicalPath: string,
): Promise<Response> {
  const resource = await getResource(env, logicalPath, access);
  if (!resource) {
    return new Response("Not found.", { status: 404, headers: baseHeaders() });
  }

  const depth = normalizeDepth(request.headers.get("depth"));
  const responses: string[] = [buildPropfindResponse(url.origin, access.basePath, resource)];

  if (resource.kind === "collection" && depth > 0) {
    const listing = await env.WEBDAV_BUCKET.list({
      prefix: logicalCollectionToStoragePrefix(access, resource.key),
      delimiter: "/",
      limit: 1000,
    });

    for (const childPrefix of listing.delimitedPrefixes) {
      const key = collectionPrefix(storageToLogicalKey(access, childPrefix));
      if (!resource.key || key !== resource.key) {
        responses.push(
          buildPropfindResponse(url.origin, access.basePath, {
            kind: "collection",
            key,
            marker: null,
          }),
        );
      }
    }

    for (const object of listing.objects) {
      const logicalKey = storageToLogicalKey(access, object.key);
      if (isDirectoryMarker(logicalKey) || logicalKey === stripTrailingSlash(resource.key)) {
        continue;
      }
      responses.push(
        buildPropfindResponse(url.origin, access.basePath, {
          kind: "file",
          key: logicalKey,
          object,
        }),
      );
    }
  }

  const xml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<d:multistatus xmlns:d="DAV:">${responses.join("")}</d:multistatus>`;

  return new Response(xml, {
    status: 207,
    headers: baseHeaders({
      "Content-Type": 'application/xml; charset="utf-8"',
    }),
  });
}

function normalizeDepth(depthHeader: string | null): 0 | 1 {
  return depthHeader === "0" ? 0 : 1;
}

function buildPropfindResponse(origin: string, basePath: string, resource: Resource): string {
  const href = xmlEscape(encodeHref(origin, basePath, resource.key, resource.kind === "collection"));
  const props: string[] = [];

  props.push(`<d:displayname>${xmlEscape(displayName(resource.key))}</d:displayname>`);

  if (resource.kind === "collection") {
    props.push("<d:resourcetype><d:collection/></d:resourcetype>");
    props.push("<d:getcontenttype>httpd/unix-directory</d:getcontenttype>");
    if (resource.marker?.uploaded) {
      props.push(`<d:getlastmodified>${xmlEscape(resource.marker.uploaded.toUTCString())}</d:getlastmodified>`);
    }
  } else {
    props.push("<d:resourcetype/>");
    props.push(`<d:getcontentlength>${resource.object.size}</d:getcontentlength>`);
    props.push(`<d:getlastmodified>${xmlEscape(resource.object.uploaded.toUTCString())}</d:getlastmodified>`);
    props.push(`<d:getetag>${xmlEscape(resource.object.httpEtag)}</d:getetag>`);
    props.push(
      `<d:getcontenttype>${xmlEscape(resource.object.httpMetadata?.contentType ?? "application/octet-stream")}</d:getcontenttype>`,
    );
  }

  return `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props.join(
    "",
  )}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
}

function displayName(key: string): string {
  if (!key) {
    return "/";
  }
  const clean = stripTrailingSlash(key);
  const parts = clean.split("/");
  return parts[parts.length - 1] ?? clean;
}

async function collectionExistsByKey(env: Env, access: AppAccess, collectionKey: string): Promise<boolean> {
  if (!collectionKey) {
    return true;
  }

  const markerKey = storageCollectionMarkerKey(access, collectionKey);
  if (markerKey) {
    const marker = await env.WEBDAV_BUCKET.head(markerKey);
    if (marker) {
      return true;
    }
  }

  const listing = await env.WEBDAV_BUCKET.list({
    prefix: logicalCollectionToStoragePrefix(access, collectionKey),
    limit: 1,
  });
  return listing.objects.length > 0 || listing.delimitedPrefixes.length > 0;
}

export async function collectStorageKeys(env: Env, prefix: string): Promise<string[]> {
  let cursor: string | undefined;
  const keys: string[] = [];

  do {
    const listing = await env.WEBDAV_BUCKET.list({
      prefix,
      cursor,
      limit: 1000,
    });
    for (const object of listing.objects) {
      keys.push(object.key);
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return keys;
}

export async function deleteStorageKeysInBatches(env: Env, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += 1000) {
    await env.WEBDAV_BUCKET.delete(keys.slice(index, index + 1000));
  }
}

async function deleteExistingResource(env: Env, access: AppAccess, resource: Resource): Promise<void> {
  if (resource.kind === "file") {
    await env.WEBDAV_BUCKET.delete(logicalToStorageKey(access, resource.key));
    return;
  }

  const keys = await collectStorageKeys(env, logicalCollectionToStoragePrefix(access, resource.key));
  if (keys.length > 0) {
    await deleteStorageKeysInBatches(env, keys);
  }
}

async function copyFile(env: Env, access: AppAccess, sourceKey: string, destinationKey: string): Promise<void> {
  const sourceObject = await env.WEBDAV_BUCKET.get(logicalToStorageKey(access, sourceKey));
  if (!sourceObject || !("body" in sourceObject) || !sourceObject.body) {
    throw new Error(`Unable to read ${sourceKey}`);
  }

  await env.WEBDAV_BUCKET.put(logicalToStorageKey(access, destinationKey), sourceObject.body, {
    httpMetadata: sourceObject.httpMetadata,
    customMetadata: sourceObject.customMetadata,
  });
}

async function copyCollection(env: Env, access: AppAccess, sourceKey: string, destinationKey: string): Promise<void> {
  const sourcePrefix = logicalCollectionToStoragePrefix(access, sourceKey);
  const destinationPrefix = logicalCollectionToStoragePrefix(access, destinationKey);
  const keys = await collectStorageKeys(env, sourcePrefix);

  if (keys.length === 0) {
    const markerKey = storageCollectionMarkerKey(access, destinationKey);
    if (markerKey) {
      await env.WEBDAV_BUCKET.put(markerKey, "");
    }
    return;
  }

  for (const key of keys) {
    const suffix = key.slice(sourcePrefix.length);
    const sourceObject = await env.WEBDAV_BUCKET.get(key);
    if (!sourceObject || !("body" in sourceObject) || !sourceObject.body) {
      continue;
    }

    await env.WEBDAV_BUCKET.put(`${destinationPrefix}${suffix}`, sourceObject.body, {
      httpMetadata: sourceObject.httpMetadata,
      customMetadata: sourceObject.customMetadata,
    });
  }
}
