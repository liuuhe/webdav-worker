import {
  ADMIN_CONFIG_KEY,
  ADMIN_SESSION_PREFIX,
  MANAGE_SEGMENT,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./constants";
import {
  authenticateAdminWithCoordinator,
  changeAdminPasswordWithCoordinator,
  destroyAdminSessionWithCoordinator,
  setupAdminPasswordWithCoordinator,
} from "./config-coordinator";
import type { AdminConfigRecord, AdminSessionRecord, AdminSessionState, Env } from "./types";

export async function getAdminConfig(env: Env): Promise<AdminConfigRecord | null> {
  return (await env.WEBDAV_CONFIG.get<AdminConfigRecord>(ADMIN_CONFIG_KEY, "json")) ?? null;
}

export async function isAdminConfigured(env: Env): Promise<boolean> {
  const config = await getAdminConfig(env);
  return Boolean(config?.passwordHash);
}

export async function setupAdminPassword(env: Env, bootstrapToken: string, newPassword: string) {
  return setupAdminPasswordWithCoordinator(env, bootstrapToken, newPassword);
}

export async function authenticateAdmin(env: Env, request: Request, password: string) {
  return authenticateAdminWithCoordinator(env, adminLoginFingerprint(request), password);
}

export async function changeAdminPassword(env: Env, currentPassword: string, newPassword: string) {
  return changeAdminPasswordWithCoordinator(env, currentPassword, newPassword);
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
    await destroyAdminSessionWithCoordinator(env, sessionId);
  }
}

export async function getAdminSessionState(env: Env, request: Request): Promise<AdminSessionState> {
  const [session, configured] = await Promise.all([getAdminSessionFromRequest(env, request), isAdminConfigured(env)]);
  return {
    authenticated: Boolean(session),
    adminConfigured: configured,
    csrfToken: session?.csrfToken ?? "",
  };
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

function adminLoginFingerprint(request: Request): string {
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
