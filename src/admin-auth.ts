import {
  ADMIN_CONFIG_KEY,
  ADMIN_SESSION_PREFIX,
  MANAGE_SEGMENT,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./constants";
import { hashPassword } from "./security";
import type {
  AdminConfigRecord,
  AdminErrorCode,
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
  if ((await hashPassword(password)) !== config.passwordHash) {
    return { ok: false, errorCode: "invalid_credentials" };
  }
  return { ok: true, session: await createAdminSession(env) };
}

export async function changeAdminPassword(
  env: Env,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; errorCode: AdminErrorCode }> {
  const config = await getAdminConfig(env);
  if (!config) {
    return { ok: false, errorCode: "setup_required" };
  }
  if ((await hashPassword(currentPassword)) !== config.passwordHash) {
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
  return { ok: true };
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
