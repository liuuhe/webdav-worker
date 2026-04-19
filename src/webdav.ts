import { DAV_HEADERS } from "./constants";
import {
  assertLockPermission,
  assertRecursiveDeletePermission,
  determineLockDepth,
  extractLockOwner,
  findMatchingLock,
  getApplicableLockDetails,
  getExactLockDetails,
  getLockDiscoveryXml,
  getSupportedLockXml,
  moveLockRecords,
  parseTimeout,
  putExactLockDetails,
} from "./webdav-locks";
import {
  collectionExistsByKey,
  collectionPrefix,
  copyCollection,
  copyFile,
  deleteExistingResource,
  directoryMarkerToCollectionKey,
  getResource,
  isDescendantKey,
  isDirectoryMarker,
  logicalCollectionToStoragePrefix,
  logicalToStorageKey,
  normalizeKey,
  parentCollectionKey,
  storageCollectionMarkerKey,
  storageToLogicalKey,
  stripTrailingSlash,
} from "./webdav-store";
import type { AppAccess, Env, LockDetails, Resource } from "./types";

export async function handleWebDavRequest(
  request: Request,
  env: Env,
  url: URL,
  access: AppAccess,
  logicalPath: string,
): Promise<Response> {
  switch (request.method) {
    case "OPTIONS":
      return new Response(null, { status: 204, headers: baseHeaders() });
    case "PROPFIND":
      return handlePropfind(request, env, url, access, logicalPath);
    case "MKCOL":
      return handleMkcol(request, env, logicalPath, access);
    case "PUT":
      return handlePut(request, env, logicalPath, access);
    case "GET":
      return handleGet(request, env, logicalPath, access);
    case "HEAD":
      return handleHead(env, logicalPath, access);
    case "DELETE":
      return handleDelete(request, env, logicalPath, access);
    case "COPY":
    case "MOVE":
      return handleCopyMove(request, env, url, access, logicalPath);
    case "LOCK":
      return handleLock(request, env, url, access, logicalPath);
    case "UNLOCK":
      return handleUnlock(request, env, logicalPath, access);
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

async function handleMkcol(request: Request, env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
  const key = normalizeKey(logicalPath, true);
  if (!key) {
    return new Response("Cannot create the root collection.", {
      status: 405,
      headers: baseHeaders(),
    });
  }

  const lockResponse = await assertLockPermission(env, access, key, request);
  if (lockResponse) {
    return lockResponse;
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

  const lockResponse = await assertLockPermission(env, access, key, request);
  if (lockResponse) {
    return lockResponse;
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

async function handleDelete(request: Request, env: Env, logicalPath: string, access: AppAccess): Promise<Response> {
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

  const lockResponse =
    resource.kind === "collection"
      ? await assertRecursiveDeletePermission(env, access, resource.key, request)
      : await assertLockPermission(env, access, resource.key, request);
  if (lockResponse) {
    return lockResponse;
  }

  await deleteExistingResource(env, access, resource);
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

  if (request.method === "MOVE") {
    const sourceLockResponse =
      source.kind === "collection"
        ? await assertRecursiveDeletePermission(env, access, source.key, request)
        : await assertLockPermission(env, access, source.key, request);
    if (sourceLockResponse) {
      return sourceLockResponse;
    }
  }

  const destinationLockResponse = await assertLockPermission(env, access, destinationKey, request);
  if (destinationLockResponse) {
    return destinationLockResponse;
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
    const destinationDeleteLockResponse =
      existingDestination.kind === "collection"
        ? await assertRecursiveDeletePermission(env, access, existingDestination.key, request)
        : await assertLockPermission(env, access, existingDestination.key, request);
    if (destinationDeleteLockResponse) {
      return destinationDeleteLockResponse;
    }
    await deleteExistingResource(env, access, existingDestination);
  }

  if (source.kind === "file") {
    await copyFile(env, access, source.key, destinationKey);
  } else {
    await copyCollection(env, access, source.key, destinationKey);
  }

  if (request.method === "MOVE") {
    await moveLockRecords(env, access, source.key, destinationKey, source.kind === "collection");
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

  const depth = normalizePropfindDepth(request.headers.get("depth"));
  if (depth === null) {
    return new Response("Bad Request.", { status: 400, headers: baseHeaders() });
  }

  const responses: string[] = [await buildPropfindResponse(env, url.origin, access.basePath, access, resource)];

  if (resource.kind === "collection" && depth !== 0) {
    for (const descendant of await listPropfindDescendants(env, access, resource.key, depth)) {
      responses.push(await buildPropfindResponse(env, url.origin, access.basePath, access, descendant));
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

function normalizePropfindDepth(depthHeader: string | null): 0 | 1 | "infinity" | null {
  if (depthHeader === null) {
    return 1;
  }

  const normalized = depthHeader.trim().toLowerCase();
  if (normalized === "0") {
    return 0;
  }
  if (normalized === "1") {
    return 1;
  }
  if (normalized === "infinity") {
    return "infinity";
  }
  return null;
}

async function buildPropfindResponse(
  env: Env,
  origin: string,
  basePath: string,
  access: AppAccess,
  resource: Resource,
): Promise<string> {
  const href = xmlEscape(encodeHref(origin, basePath, resource.key, resource.kind === "collection"));
  const props: string[] = [];
  const activeLocks = await getApplicableLockDetails(env, access, resource.key);

  props.push(`<d:displayname>${xmlEscape(displayName(resource.key))}</d:displayname>`);
  props.push(`<d:supportedlock>${getSupportedLockXml()}</d:supportedlock>`);
  props.push(
    `<d:lockdiscovery>${activeLocks.length === 0 ? "" : getLockDiscoveryXml(origin, basePath, activeLocks)}</d:lockdiscovery>`,
  );

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

async function listPropfindDescendants(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  depth: 1 | "infinity",
): Promise<Resource[]> {
  const resources = new Map<string, Resource>();
  let cursor: string | undefined;

  do {
    const listing = await env.WEBDAV_BUCKET.list({
      prefix: logicalCollectionToStoragePrefix(access, resourceKey),
      cursor,
      limit: 1000,
    });

    for (const object of listing.objects) {
      const logicalKey = storageToLogicalKey(access, object.key);
      if (isDirectoryMarker(logicalKey)) {
        const collectionKey = directoryMarkerToCollectionKey(logicalKey);
        if (!collectionKey || collectionKey === resourceKey || !isDescendantKey(resourceKey, collectionKey)) {
          continue;
        }

        addAncestorCollectionResources(resources, resourceKey, collectionKey);
        upsertCollectionResource(resources, {
          kind: "collection",
          key: collectionKey,
          marker: object,
        });
        continue;
      }

      if (!isDescendantKey(resourceKey, logicalKey)) {
        continue;
      }

      resources.set(logicalKey, {
        kind: "file",
        key: logicalKey,
        object,
      });
      addAncestorCollectionResources(resources, resourceKey, logicalKey);
    }

    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  const maxDepth = depth === "infinity" ? Number.POSITIVE_INFINITY : depth;
  return [...resources.values()]
    .filter((resource) => relativeDepth(resourceKey, resource.key) <= maxDepth)
    .sort((left, right) => comparePropfindResource(resourceKey, left, right));
}

function addAncestorCollectionResources(resources: Map<string, Resource>, baseKey: string, descendantKey: string): void {
  const collectionKey = descendantKey.endsWith("/") ? descendantKey : parentCollectionKey(descendantKey);
  if (!collectionKey) {
    return;
  }

  const baseDepth = segmentCount(baseKey);
  const segments = stripTrailingSlash(collectionKey).split("/").filter(Boolean);
  for (let index = baseDepth + 1; index <= segments.length; index += 1) {
    const key = `${segments.slice(0, index).join("/")}/`;
    if (key === baseKey) {
      continue;
    }
    upsertCollectionResource(resources, {
      kind: "collection",
      key,
      marker: null,
    });
  }
}

function upsertCollectionResource(
  resources: Map<string, Resource>,
  nextResource: Extract<Resource, { kind: "collection" }>,
): void {
  const existing = resources.get(nextResource.key);
  if (!existing || existing.kind !== "collection" || (!existing.marker && nextResource.marker)) {
    resources.set(nextResource.key, nextResource);
  }
}

function relativeDepth(baseKey: string, candidateKey: string): number {
  return segmentCount(candidateKey) - segmentCount(baseKey);
}

function segmentCount(key: string): number {
  if (!key) {
    return 0;
  }
  return stripTrailingSlash(key).split("/").filter(Boolean).length;
}

function comparePropfindResource(baseKey: string, left: Resource, right: Resource): number {
  const depthDifference = relativeDepth(baseKey, left.key) - relativeDepth(baseKey, right.key);
  if (depthDifference !== 0) {
    return depthDifference;
  }
  if (left.kind !== right.kind) {
    return left.kind === "collection" ? -1 : 1;
  }
  return left.key.localeCompare(right.key);
}

async function handleLock(
  request: Request,
  env: Env,
  url: URL,
  access: AppAccess,
  logicalPath: string,
): Promise<Response> {
  const depthHeader = request.headers.get("depth");
  const body = await request.text();
  const requestedScope: LockDetails["scope"] = /<(?:[\w-]+:)?shared\b/i.test(body) ? "shared" : "exclusive";
  if (body !== "" && !/<(?:[\w-]+:)?write\b/i.test(body)) {
    return new Response("Bad Request.", { status: 400, headers: baseHeaders() });
  }

  const initialResource = await getResource(env, logicalPath, access);
  const createdLockNullResource = !initialResource && body !== "";
  let resourceKey = initialResource
    ? initialResource.key
    : normalizeKey(logicalPath, logicalPath.endsWith("/"));
  let isCollection = initialResource ? initialResource.kind === "collection" : resourceKey === "";
  const lockResponse = await assertLockPermission(env, access, resourceKey, request, {
    ignoreSharedLocksOnTarget: body !== "" && requestedScope === "shared",
  });
  if (lockResponse) {
    return lockResponse;
  }

  const refreshTarget = body === "" ? await findMatchingLock(env, access, resourceKey, request) : null;
  let lockRootKey = refreshTarget?.resourceKey ?? resourceKey;
  let currentLocks = await getExactLockDetails(env, access, lockRootKey);
  const existingLock = refreshTarget?.lockDetails;

  if (!initialResource) {
    if (body === "") {
      return new Response("Bad Request.", { status: 400, headers: baseHeaders() });
    }
    if (logicalPath.endsWith("/")) {
      return new Response("Conflict.", { status: 409, headers: baseHeaders() });
    }
    const parentKey = parentCollectionKey(resourceKey);
    if (!(await collectionExistsByKey(env, access, parentKey))) {
      return new Response("Conflict.", { status: 409, headers: baseHeaders() });
    }
    await env.WEBDAV_BUCKET.put(logicalToStorageKey(access, resourceKey), "");
    isCollection = false;
    currentLocks = [];
    lockRootKey = resourceKey;
  } else if (refreshTarget) {
    isCollection = lockRootKey === "" || lockRootKey.endsWith("/");
  }

  const depth = existingLock && depthHeader === null && body === "" ? existingLock.depth : determineLockDepth(isCollection, depthHeader);
  if (!depth) {
    return new Response("Bad Request.", { status: 400, headers: baseHeaders() });
  }

  if (!existingLock) {
    if (requestedScope === "exclusive" && currentLocks.length > 0) {
      return new Response("Locked.", { status: 423, headers: baseHeaders() });
    }
    if (requestedScope === "shared" && currentLocks.some((lock) => lock.scope === "exclusive")) {
      return new Response("Locked.", { status: 423, headers: baseHeaders() });
    }
  }

  const { timeout, expiresAt } = parseTimeout(request.headers.get("Timeout"));
  const owner = extractLockOwner(body);
  const lockDetails: LockDetails = {
    token: existingLock?.token ?? crypto.randomUUID(),
    owner: owner ?? existingLock?.owner,
    scope: existingLock?.scope ?? requestedScope,
    depth,
    timeout,
    expiresAt,
    rootKey: lockRootKey,
  };

  const updatedLocks = existingLock
    ? currentLocks.map((currentLock) => (currentLock.token === existingLock.token ? lockDetails : currentLock))
    : [...currentLocks, lockDetails];
  await putExactLockDetails(env, access, lockRootKey, updatedLocks);

  const responseBody =
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<d:prop xmlns:d="DAV:"><d:lockdiscovery>${getLockDiscoveryXml(url.origin, access.basePath, updatedLocks)}</d:lockdiscovery></d:prop>`;
  return new Response(responseBody, {
    status: existingLock || !createdLockNullResource ? 200 : 201,
    headers: baseHeaders({
      "Content-Type": 'application/xml; charset="utf-8"',
      "Lock-Token": `<urn:uuid:${lockDetails.token}>`,
      ...(existingLock
        ? {}
        : {
            Location: encodeHref(url.origin, access.basePath, lockRootKey, isCollection),
          }),
    }),
  });
}

async function handleUnlock(
  request: Request,
  env: Env,
  logicalPath: string,
  access: AppAccess,
): Promise<Response> {
  const resource = await getResource(env, logicalPath, access);
  if (!resource) {
    return new Response("Not found.", { status: 404, headers: baseHeaders() });
  }

  const lockToken = request.headers.get("Lock-Token");
  if (!lockToken) {
    return new Response("Bad Request.", { status: 400, headers: baseHeaders() });
  }

  const lockResponse = await assertLockPermission(env, access, resource.key, request);
  if (lockResponse) {
    return lockResponse;
  }

  const exactLocks = await getExactLockDetails(env, access, resource.key);
  const normalizedToken = lockToken.trim().replace(/^<|>$/g, "").replace(/^(?:urn:uuid:|opaquelocktoken:)/, "");
  if (!exactLocks.some((lock) => lock.token === normalizedToken)) {
    return new Response("Conflict.", { status: 409, headers: baseHeaders() });
  }

  await putExactLockDetails(
    env,
    access,
    resource.key,
    exactLocks.filter((lock) => lock.token !== normalizedToken),
  );
  return new Response(null, { status: 204, headers: baseHeaders() });
}
