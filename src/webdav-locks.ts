import { DAV_HEADERS, LOCK_KEY_PREFIX } from "./constants";
import type { AppAccess, Env, LockDetails } from "./types";

const DEFAULT_LOCK_TIMEOUT = 3600;
const MAX_LOCK_TIMEOUT = 365 * 24 * 60 * 60;

export function getSupportedLockXml(): string {
  return [
    "<d:lockentry><d:lockscope><d:exclusive/></d:lockscope><d:locktype><d:write/></d:locktype></d:lockentry>",
    "<d:lockentry><d:lockscope><d:shared/></d:lockscope><d:locktype><d:write/></d:locktype></d:lockentry>",
  ].join("");
}

export function getLockDiscoveryXml(origin: string, basePath: string, locks: LockDetails[]): string {
  return locks
    .map((lock) => {
      const href = xmlEscape(resourceHref(origin, basePath, lock.rootKey));
      const owner = lock.owner ? `<d:owner>${lock.owner}</d:owner>` : "";
      return `<d:activelock><d:locktype><d:write/></d:locktype><d:lockscope><d:${lock.scope}/></d:lockscope><d:depth>${lock.depth}</d:depth>${owner}<d:timeout>${xmlEscape(lock.timeout)}</d:timeout><d:locktoken><d:href>urn:uuid:${xmlEscape(lock.token)}</d:href></d:locktoken><d:lockroot><d:href>${href}</d:href></d:lockroot></d:activelock>`;
    })
    .join("");
}

export function determineLockDepth(isCollection: boolean, depthHeader: string | null): LockDetails["depth"] | null {
  if (depthHeader !== null && depthHeader !== "0" && depthHeader !== "infinity") {
    return null;
  }
  if (isCollection) {
    return (depthHeader ?? "infinity") as LockDetails["depth"];
  }
  return depthHeader === "infinity" ? "infinity" : "0";
}

export function parseTimeout(timeoutHeader: string | null): { timeout: string; expiresAt: number } {
  if (timeoutHeader === null) {
    return defaultTimeout();
  }

  for (const item of timeoutHeader.split(",").map((value) => value.trim())) {
    if (item.toLowerCase() === "infinite") {
      return {
        timeout: "Infinite",
        expiresAt: Date.now() + MAX_LOCK_TIMEOUT * 1000,
      };
    }

    let seconds = Number(item.match(/^Second-(\d+)$/i)?.[1] ?? Number.NaN);
    if (Number.isFinite(seconds) && seconds > 0) {
      seconds = Math.min(seconds, MAX_LOCK_TIMEOUT);
      return {
        timeout: `Second-${seconds}`,
        expiresAt: Date.now() + seconds * 1000,
      };
    }
  }

  return defaultTimeout();
}

export function normalizeLockToken(lockToken: string): string {
  return lockToken
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/^(?:urn:uuid:|opaquelocktoken:)/, "");
}

export function getRequestLockTokens(request: Request): string[] {
  const lockTokens: string[] = [];
  const directLockToken = request.headers.get("Lock-Token");
  if (directLockToken) {
    lockTokens.push(normalizeLockToken(directLockToken));
  }

  const ifHeader = request.headers.get("If");
  if (ifHeader) {
    for (const match of ifHeader.matchAll(/<([^>]+)>/g)) {
      const token = normalizeLockToken(match[1]);
      if (token !== "") {
        lockTokens.push(token);
      }
    }
  }

  return [...new Set(lockTokens)];
}

export function hasAlwaysFalseIfCondition(request: Request): boolean {
  const ifHeader = request.headers.get("If") ?? "";
  return ifHeader.includes("<DAV:no-lock>") && !ifHeader.includes("Not <DAV:no-lock>");
}

export function extractLockOwner(body: string): string | undefined {
  const owner = body.match(/<(?:[\w-]+:)?owner(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?owner>/i)?.[1];
  if (owner === undefined) {
    return undefined;
  }

  const trimmed = owner.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function getExactLockDetails(env: Env, access: AppAccess, resourceKey: string): Promise<LockDetails[]> {
  const storageKey = lockStorageKey(access, resourceKey);
  const raw = (await env.WEBDAV_CONFIG.get<unknown>(storageKey, "json")) ?? [];
  const parsed = Array.isArray(raw) ? raw.flatMap(normalizeStoredLock) : [];
  const activeLocks = parsed.filter((lock) => lock.expiresAt > Date.now());
  if (activeLocks.length !== parsed.length) {
    await putExactLockDetails(env, access, resourceKey, activeLocks);
  }
  return activeLocks;
}

export async function putExactLockDetails(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  locks: LockDetails[],
): Promise<void> {
  const storageKey = lockStorageKey(access, resourceKey);
  const activeLocks = locks.filter((lock) => lock.expiresAt > Date.now());
  if (activeLocks.length === 0) {
    await env.WEBDAV_CONFIG.delete(storageKey);
    return;
  }

  const maxTtlSeconds = Math.max(
    60,
    Math.ceil((Math.max(...activeLocks.map((lock) => lock.expiresAt)) - Date.now()) / 1000),
  );
  await env.WEBDAV_CONFIG.put(storageKey, JSON.stringify(activeLocks), {
    expirationTtl: maxTtlSeconds,
  });
}

export async function assertLockPermission(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  request: Request,
  options: { ignoreSharedLocksOnTarget?: boolean } = {},
): Promise<Response | null> {
  if (hasAlwaysFalseIfCondition(request)) {
    return davResponse("Precondition Failed.", 412);
  }

  const lockTokens = getRequestLockTokens(request);
  for (const candidate of getLockCandidates(resourceKey)) {
    const locks = (await getExactLockDetails(env, access, candidate)).filter(
      (lock) =>
        (candidate === resourceKey || lock.depth === "infinity") &&
        !(options.ignoreSharedLocksOnTarget && candidate === resourceKey && lock.scope === "shared"),
    );
    if (locks.length === 0) {
      continue;
    }
    if (!locks.some((lock) => lockTokens.includes(lock.token))) {
      return davResponse("Locked.", 423);
    }
  }

  return null;
}

export async function assertRecursiveDeletePermission(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  request: Request,
): Promise<Response | null> {
  const lockResponse = await assertLockPermission(env, access, resourceKey, request);
  if (lockResponse) {
    return lockResponse;
  }

  const lockTokens = getRequestLockTokens(request);
  const descendants = await listLockKeysByPrefix(env, access, resourceKey === "" ? "" : collectionPrefix(resourceKey));
  for (const descendant of descendants) {
    if (descendant === resourceKey) {
      continue;
    }
    const locks = await getExactLockDetails(env, access, descendant);
    if (locks.length > 0 && !locks.some((lock) => lockTokens.includes(lock.token))) {
      return davResponse("Locked.", 423);
    }
  }

  return null;
}

export async function findMatchingLock(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  request: Request,
): Promise<{ resourceKey: string; lockDetails: LockDetails } | null> {
  const tokens = getRequestLockTokens(request);
  for (const candidate of getLockCandidates(resourceKey)) {
    const lockDetails = (await getExactLockDetails(env, access, candidate)).find(
      (lock) => tokens.includes(lock.token) && (candidate === resourceKey || lock.depth === "infinity"),
    );
    if (lockDetails) {
      return {
        resourceKey: candidate,
        lockDetails,
      };
    }
  }
  return null;
}

export async function getApplicableLockDetails(
  env: Env,
  access: AppAccess,
  resourceKey: string,
): Promise<LockDetails[]> {
  const applicable: LockDetails[] = [];
  for (const candidate of getLockCandidates(resourceKey)) {
    const locks = await getExactLockDetails(env, access, candidate);
    if (candidate === resourceKey) {
      applicable.push(...locks);
      continue;
    }
    applicable.push(...locks.filter((lock) => lock.depth === "infinity"));
  }
  return applicable;
}

export async function deleteLockRecordsForPath(
  env: Env,
  access: AppAccess,
  resourceKey: string,
  recursive: boolean,
): Promise<void> {
  const keys = recursive ? await listLockKeysByPrefix(env, access, resourceKey === "" ? "" : collectionPrefix(resourceKey)) : [];
  if (!recursive && resourceKey !== "") {
    keys.push(resourceKey);
  }
  if (recursive && resourceKey !== "") {
    keys.push(resourceKey);
  }
  if (recursive && resourceKey === "") {
    keys.push("");
  }

  const uniqueKeys = [...new Set(keys)];
  await Promise.all(uniqueKeys.map((key) => env.WEBDAV_CONFIG.delete(lockStorageKey(access, key))));
}

export async function moveLockRecords(
  env: Env,
  access: AppAccess,
  sourceKey: string,
  destinationKey: string,
  isCollection: boolean,
): Promise<void> {
  const sourcePaths = isCollection
    ? [...new Set([sourceKey, ...(await listLockKeysByPrefix(env, access, collectionPrefix(sourceKey)))])]
    : [sourceKey];

  for (const sourcePath of sourcePaths) {
    const locks = await getExactLockDetails(env, access, sourcePath);
    if (locks.length === 0) {
      continue;
    }

    const movedPath = isCollection
      ? `${destinationKey}${sourcePath.slice(collectionPrefix(sourceKey).length)}`.replace(/\/+/g, "/")
      : destinationKey;
    const normalizedMovedPath =
      isCollection && sourcePath === sourceKey ? destinationKey : sourcePath === sourceKey ? destinationKey : movedPath;
    const nextLocks = locks.map((lock) => ({
      ...lock,
      rootKey: normalizedMovedPath,
    }));
    await putExactLockDetails(env, access, normalizedMovedPath, nextLocks);
    if (normalizedMovedPath !== sourcePath) {
      await env.WEBDAV_CONFIG.delete(lockStorageKey(access, sourcePath));
    }
  }
}

function normalizeStoredLock(raw: unknown): LockDetails[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const token = typeof (raw as { token?: unknown }).token === "string" ? (raw as { token: string }).token : "";
  if (!token) {
    return [];
  }
  const expiresAt = Number((raw as { expiresAt?: unknown }).expiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return [];
  }
  return [
    {
      token,
      owner: typeof (raw as { owner?: unknown }).owner === "string" ? (raw as { owner: string }).owner : undefined,
      scope: (raw as { scope?: unknown }).scope === "shared" ? "shared" : "exclusive",
      depth: (raw as { depth?: unknown }).depth === "infinity" ? "infinity" : "0",
      timeout:
        typeof (raw as { timeout?: unknown }).timeout === "string"
          ? (raw as { timeout: string }).timeout
          : `Second-${DEFAULT_LOCK_TIMEOUT}`,
      expiresAt,
      rootKey:
        typeof (raw as { rootKey?: unknown }).rootKey === "string" ? (raw as { rootKey: string }).rootKey : "",
    },
  ];
}

async function listLockKeysByPrefix(env: Env, access: AppAccess, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const listing = await env.WEBDAV_CONFIG.list({
      prefix: lockListPrefix(access, prefix),
      cursor,
    } as KVNamespaceListOptions);
    for (const entry of listing.keys) {
      keys.push(parseLockStorageKey(access, entry.name));
    }
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);

  return keys;
}

function lockStorageKey(access: AppAccess, resourceKey: string): string {
  return `${LOCK_KEY_PREFIX}${access.appId}:${resourceKey === "" ? "/" : resourceKey}`;
}

function lockListPrefix(access: AppAccess, resourceKeyPrefix: string): string {
  return `${LOCK_KEY_PREFIX}${access.appId}:${resourceKeyPrefix}`;
}

function parseLockStorageKey(access: AppAccess, storageKey: string): string {
  const prefix = `${LOCK_KEY_PREFIX}${access.appId}:`;
  const logical = storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : storageKey;
  return logical === "/" ? "" : logical;
}

function getLockCandidates(resourceKey: string): string[] {
  const candidates: string[] = [];
  let current = resourceKey;
  while (true) {
    candidates.push(current);
    if (current === "") {
      return candidates;
    }
    current = parentCandidateKey(current);
  }
}

function parentCandidateKey(resourceKey: string): string {
  if (resourceKey === "") {
    return "";
  }
  if (resourceKey.endsWith("/")) {
    const trimmed = resourceKey.slice(0, -1);
    const slashIndex = trimmed.lastIndexOf("/");
    return slashIndex < 0 ? "" : trimmed.slice(0, slashIndex + 1);
  }
  const slashIndex = resourceKey.lastIndexOf("/");
  return slashIndex < 0 ? "" : resourceKey.slice(0, slashIndex + 1);
}

function collectionPrefix(key: string): string {
  if (!key) {
    return "";
  }
  return key.endsWith("/") ? key : `${key}/`;
}

function isCollectionKey(key: string): boolean {
  return key === "" || key.endsWith("/");
}

function resourceHref(origin: string, basePath: string, key: string): string {
  const normalized = key.endsWith("/") ? key.slice(0, -1) : key;
  const encodedPath = normalized
    ? normalized
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    : "";
  const fullPath = encodedPath ? `${basePath}/${encodedPath}` : basePath;
  return `${origin}${isCollectionKey(key) ? `${fullPath}/` : fullPath}`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function defaultTimeout(): { timeout: string; expiresAt: number } {
  return {
    timeout: `Second-${DEFAULT_LOCK_TIMEOUT}`,
    expiresAt: Date.now() + DEFAULT_LOCK_TIMEOUT * 1000,
  };
}

function davResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: new Headers(DAV_HEADERS),
  });
}
