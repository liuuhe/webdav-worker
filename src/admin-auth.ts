import {
  ADMIN_CONFIG_KEY,
  ADMIN_LOGIN_ATTEMPT_PREFIX,
  ADMIN_SESSION_PREFIX,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_SECONDS,
  MANAGE_SEGMENT,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./constants";
import { hashPassword, sha256Hex, verifyPassword } from "./security";
import type {
  AdminConfigRecord,
  AdminErrorCode,
  AdminLoginAttemptRecord,
  AdminSessionRecord,
  Env,
} from "./types";

export async function getAdminConfig(env: Env): Promise<AdminConfigRecord | null> {
  return (await env.WEBDAV_CONFIG.get<AdminConfigRecord>(ADMIN_CONFIG_KEY, "json")) ?? null;
}

export async function isAdminConfigured(env: Env): Promise<boolean> {
  const config = await getAdminConfig(env);
  return Boolean(config?.passwordHash);
}

export async function setupAdminPassword(
  env: Env,
  bootstrapToken: string,
  newPassword: string,
): Promise<{ ok: true; session: AdminSessionRecord } | { ok: false; errorCode: AdminErrorCode }> {
  if (await isAdminConfigured(env)) {
    return { ok: false, errorCode: "already_configured" };
  }
  if (!newPassword.trim()) {
    return { ok: false, errorCode: "new_password_required" };
  }
  if (!env.ADMIN_TOKEN || bootstrapToken !== env.ADMIN_TOKEN) {
    return { ok: false, errorCode: "bootstrap_token_invalid" };
  }

  const now = new Date().toISOString();
  const config: AdminConfigRecord = {
    passwordHash: await hashPassword(newPassword),
    createdAt: now,
    updatedAt: now,
  };

  await env.WEBDAV_CONFIG.put(ADMIN_CONFIG_KEY, JSON.stringify(config));
  return { ok: true, session: await createAdminSession(env) };
}

export async function authenticateAdmin(
  env: Env,
  password: string,
): Promise<{ ok: true; session: AdminSessionRecord } | { ok: false; errorCode: AdminErrorCode }> {
  const config = await getAdminConfig(env);
  if (!config) {
    return { ok: false, errorCode: "setup_required" };
  }

  const verification = await verifyPassword(password, config.passwordHash);
  if (!verification.ok) {
    return { ok: false, errorCode: "invalid_credentials" };
  }

  if (verification.upgradedHash) {
    await env.WEBDAV_CONFIG.put(
      ADMIN_CONFIG_KEY,
      JSON.stringify({
        ...config,
        passwordHash: verification.upgradedHash,
        updatedAt: new Date().toISOString(),
      } satisfies AdminConfigRecord),
    );
  }

  return { ok: true, session: await createAdminSession(env) };
}

export async function changeAdminPassword(
  env: Env,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; session: AdminSessionRecord } | { ok: false; errorCode: AdminErrorCode }> {
  const config = await getAdminConfig(env);
  if (!config) {
    return { ok: false, errorCode: "setup_required" };
  }
  const verification = await verifyPassword(currentPassword, config.passwordHash);
  if (!verification.ok) {
    return { ok: false, errorCode: "current_password_invalid" };
  }
  if (!newPassword.trim()) {
    return { ok: false, errorCode: "new_password_required" };
  }

  const nextConfig: AdminConfigRecord = {
    ...config,
    passwordHash: await hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  await env.WEBDAV_CONFIG.put(ADMIN_CONFIG_KEY, JSON.stringify(nextConfig));
  await destroyAllAdminSessions(env);
  return { ok: true, session: await createAdminSession(env) };
}

export async function createAdminSession(env: Env): Promise<AdminSessionRecord> {
  const now = Date.now();
  const record: AdminSessionRecord = {
    id: crypto.randomUUID(),
    csrfToken: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
  };

  await env.WEBDAV_CONFIG.put(`${ADMIN_SESSION_PREFIX}${record.id}`, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return record;
}

export async function getAdminSessionFromRequest(env: Env, request: Request): Promise<AdminSessionRecord | null> {
  const sessionId = parseCookies(request).get(SESSION_COOKIE_NAME);
  if (!sessionId) {
    return null;
  }
  const session =
    (await env.WEBDAV_CONFIG.get<AdminSessionRecord>(`${ADMIN_SESSION_PREFIX}${sessionId}`, "json")) ?? null;
  if (!session) {
    return null;
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await env.WEBDAV_CONFIG.delete(`${ADMIN_SESSION_PREFIX}${sessionId}`);
    return null;
  }
  return session;
}

export async function destroyAdminSession(env: Env, request: Request): Promise<void> {
  const sessionId = parseCookies(request).get(SESSION_COOKIE_NAME);
  if (sessionId) {
    await env.WEBDAV_CONFIG.delete(`${ADMIN_SESSION_PREFIX}${sessionId}`);
  }
}

export async function destroyAllAdminSessions(env: Env): Promise<void> {
  let cursor: string | undefined;
  do {
    const listing = await env.WEBDAV_CONFIG.list({
      prefix: ADMIN_SESSION_PREFIX,
      cursor,
    } as KVNamespaceListOptions);
    await Promise.all(listing.keys.map((entry) => env.WEBDAV_CONFIG.delete(entry.name)));
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);
}

export async function isAdminLoginRateLimited(env: Env, request: Request): Promise<boolean> {
  const attempts = await getLoginAttemptRecord(env, request);
  return (attempts?.count ?? 0) >= LOGIN_ATTEMPT_LIMIT;
}

export async function recordFailedAdminLogin(env: Env, request: Request): Promise<boolean> {
  const key = await loginAttemptKey(request);
  const attempts = (await env.WEBDAV_CONFIG.get<AdminLoginAttemptRecord>(key, "json")) ?? { count: 0 };
  const nextAttempts = {
    count: attempts.count + 1,
  } satisfies AdminLoginAttemptRecord;

  await env.WEBDAV_CONFIG.put(key, JSON.stringify(nextAttempts), {
    expirationTtl: LOGIN_ATTEMPT_WINDOW_SECONDS,
  });

  return nextAttempts.count >= LOGIN_ATTEMPT_LIMIT;
}

export async function clearFailedAdminLogins(env: Env, request: Request): Promise<void> {
  await env.WEBDAV_CONFIG.delete(await loginAttemptKey(request));
}

export function buildSessionCookie(url: URL, session: AdminSessionRecord): string {
  return serializeCookie(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: `/${MANAGE_SEGMENT}`,
    sameSite: "Lax",
    secure: url.protocol === "https:",
  });
}

export function clearSessionCookie(url: URL): string {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: `/${MANAGE_SEGMENT}`,
    sameSite: "Lax",
    secure: url.protocol === "https:",
  });
}

export function validateCsrf(request: Request, session: AdminSessionRecord): boolean {
  return request.headers.get("x-csrf-token") === session.csrfToken;
}

async function getLoginAttemptRecord(env: Env, request: Request): Promise<AdminLoginAttemptRecord | null> {
  return (await env.WEBDAV_CONFIG.get<AdminLoginAttemptRecord>(await loginAttemptKey(request), "json")) ?? null;
}

async function loginAttemptKey(request: Request): Promise<string> {
  return `${ADMIN_LOGIN_ATTEMPT_PREFIX}${await sha256Hex(loginAttemptFingerprint(request))}`;
}

function loginAttemptFingerprint(request: Request): string {
  const forwardedFor = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("User-Agent") ?? "unknown";
  return `${clientIp}|${userAgent}`;
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("cookie");
  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
