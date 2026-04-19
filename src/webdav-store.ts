import { DIRECTORY_MARKER } from "./constants";
import { deleteLockRecordsForPath } from "./webdav-locks";
import type { AppAccess, Env, Resource } from "./types";

export function decodePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  return parts.map((part) => decodeURIComponent(part)).join("/");
}

export function normalizeKey(pathname: string, forceCollection = false): string {
  const decoded = decodePath(pathname);
  if (!decoded) {
    return "";
  }
  if (forceCollection || pathname.endsWith("/")) {
    return `${stripTrailingSlash(decoded)}/`;
  }
  return decoded;
}

export function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function collectionPrefix(key: string): string {
  if (!key) {
    return "";
  }
  return key.endsWith("/") ? key : `${key}/`;
}

export function isDirectoryMarker(key: string): boolean {
  return key.endsWith(`/${DIRECTORY_MARKER}`);
}

export function parentCollectionKey(key: string): string {
  const normalized = stripTrailingSlash(key);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex < 0) {
    return "";
  }
  return `${normalized.slice(0, slashIndex)}/`;
}

export function logicalToStorageKey(access: AppAccess, logicalKey: string): string {
  return `${access.rootPrefix}${logicalKey}`;
}

export function logicalCollectionToStoragePrefix(access: AppAccess, logicalCollectionKey: string): string {
  if (!logicalCollectionKey) {
    return access.rootPrefix;
  }
  return logicalToStorageKey(access, collectionPrefix(logicalCollectionKey));
}

export function storageCollectionMarkerKey(access: AppAccess, logicalCollectionKey: string): string | null {
  const storageCollectionKey = logicalCollectionToStoragePrefix(access, logicalCollectionKey);
  if (!storageCollectionKey) {
    return null;
  }
  return `${stripTrailingSlash(storageCollectionKey)}/${DIRECTORY_MARKER}`;
}

export function storageToLogicalKey(access: AppAccess, storageKey: string): string {
  return storageKey.startsWith(access.rootPrefix) ? storageKey.slice(access.rootPrefix.length) : storageKey;
}

export async function getResource(env: Env, logicalPath: string, access: AppAccess): Promise<Resource | null> {
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

export async function collectionExistsByKey(env: Env, access: AppAccess, collectionKey: string): Promise<boolean> {
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

export async function deleteExistingResource(env: Env, access: AppAccess, resource: Resource): Promise<void> {
  if (resource.kind === "file") {
    await env.WEBDAV_BUCKET.delete(logicalToStorageKey(access, resource.key));
    await deleteLockRecordsForPath(env, access, resource.key, false);
    return;
  }

  const keys = await collectStorageKeys(env, logicalCollectionToStoragePrefix(access, resource.key));
  if (keys.length > 0) {
    await deleteStorageKeysInBatches(env, keys);
  }
  const markerKey = storageCollectionMarkerKey(access, resource.key);
  if (markerKey) {
    await env.WEBDAV_BUCKET.delete(markerKey);
  }
  await deleteLockRecordsForPath(env, access, resource.key, true);
}

export async function copyFile(env: Env, access: AppAccess, sourceKey: string, destinationKey: string): Promise<void> {
  const sourceObject = await env.WEBDAV_BUCKET.get(logicalToStorageKey(access, sourceKey));
  if (!sourceObject || !("body" in sourceObject) || !sourceObject.body) {
    throw new Error(`Unable to read ${sourceKey}`);
  }

  await env.WEBDAV_BUCKET.put(logicalToStorageKey(access, destinationKey), sourceObject.body, {
    httpMetadata: sourceObject.httpMetadata,
    customMetadata: sourceObject.customMetadata,
  });
}

export async function copyCollection(
  env: Env,
  access: AppAccess,
  sourceKey: string,
  destinationKey: string,
): Promise<void> {
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

export function directoryMarkerToCollectionKey(logicalKey: string): string | null {
  if (!isDirectoryMarker(logicalKey)) {
    return null;
  }
  return `${logicalKey.slice(0, -(`/${DIRECTORY_MARKER}`.length))}/`;
}

export function isDescendantKey(baseKey: string, candidateKey: string): boolean {
  if (!baseKey) {
    return candidateKey !== "";
  }
  return candidateKey !== baseKey && candidateKey.startsWith(collectionPrefix(baseKey));
}
