import {
  buildSessionCookie,
  changeAdminPassword,
  clearFailedAdminLogins,
  clearSessionCookie,
  destroyAdminSession,
  getAdminSessionFromRequest,
  isAdminLoginRateLimited,
  isAdminConfigured,
  recordFailedAdminLogin,
  setupAdminPassword,
  authenticateAdmin,
  validateCsrf,
} from "./admin-auth";
import { buildAppUrl, deleteAppRecord, getAppById, listApps, publicApp, saveApp, validateAppUniqueness } from "./app-store";
import { normalizeAppInput, resolveAuthSettings } from "./app-validation";
import { MANAGE_SEGMENT } from "./constants";
import { adminErrorResponse, adminMethodNotAllowed, jsonResponse, redirectResponse } from "./http";
import { renderAdminPage } from "./admin-ui";
import { collectStorageKeys, deleteStorageKeysInBatches } from "./webdav";
import type { AdminRoute, AppPayload, AppRecord, Env } from "./types";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  url: URL,
  route: AdminRoute,
): Promise<Response> {
  if (route.subPath === "/") {
    if (request.method !== "GET") {
      return adminMethodNotAllowed();
    }

    const session = await getAdminSessionFromRequest(env, request);
    return new Response(
      renderAdminPage(url.origin, {
        authenticated: Boolean(session),
        adminConfigured: await isAdminConfigured(env),
        csrfToken: session?.csrfToken ?? "",
        accessPath: `/${MANAGE_SEGMENT}`,
      }),
      {
        status: 200,
        headers: new Headers({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        }),
      },
    );
  }

  if (route.subPath === "/api/setup") {
    if (request.method !== "POST") {
      return adminMethodNotAllowed();
    }
    return handleSetup(request, env, url);
  }

  if (route.subPath === "/api/login") {
    if (request.method !== "POST") {
      return adminMethodNotAllowed();
    }
    return handleLogin(request, env, url);
  }

  if (route.subPath === "/api/logout") {
    if (request.method !== "POST") {
      return adminMethodNotAllowed();
    }
    return handleLogout(request, env, url);
  }

  if (route.subPath === "/api/password") {
    if (request.method !== "POST") {
      return adminMethodNotAllowed();
    }
    return handlePasswordChange(request, env, url);
  }

  if (route.subPath === "/api/apps") {
    switch (request.method) {
      case "GET":
        return handleListApps(request, env, url.origin);
      case "POST":
        return handleCreateApp(request, env, url.origin);
      default:
        return adminMethodNotAllowed();
    }
  }

  const appMatch = route.subPath.match(/^\/api\/apps\/([^/]+)$/);
  if (appMatch) {
    const appId = decodeURIComponent(appMatch[1] ?? "");
    switch (request.method) {
      case "PUT":
        return handleUpdateApp(request, env, appId, url.origin);
      case "DELETE":
        return handleDeleteApp(request, env, appId);
      default:
        return adminMethodNotAllowed();
    }
  }

  if (request.method === "GET") {
    return redirectResponse(`/${MANAGE_SEGMENT}`);
  }
  return new Response("Not found.", { status: 404 });
}

async function handleSetup(request: Request, env: Env, url: URL): Promise<Response> {
  const payload = await readJson<{ bootstrapToken?: unknown; newPassword?: unknown }>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const bootstrapToken = typeof payload.bootstrapToken === "string" ? payload.bootstrapToken : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const result = await setupAdminPassword(env, bootstrapToken, newPassword);
  if (!result.ok) {
    return adminErrorResponse(result.errorCode, result.errorCode === "already_configured" ? 409 : 400);
  }

  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": buildSessionCookie(url, result.session),
    },
  );
}

async function handleLogin(request: Request, env: Env, url: URL): Promise<Response> {
  if (await isAdminLoginRateLimited(env, request)) {
    return adminErrorResponse("too_many_attempts", 429);
  }

  const payload = await readJson<{ password?: unknown }>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const password = typeof payload.password === "string" ? payload.password : "";
  const result = await authenticateAdmin(env, password);
  if (!result.ok) {
    if (result.errorCode === "invalid_credentials") {
      const rateLimited = await recordFailedAdminLogin(env, request);
      return adminErrorResponse(rateLimited ? "too_many_attempts" : result.errorCode, rateLimited ? 429 : 401);
    }
    return adminErrorResponse(result.errorCode, result.errorCode === "setup_required" ? 409 : 401);
  }

  await clearFailedAdminLogins(env, request);

  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": buildSessionCookie(url, result.session),
    },
  );
}

async function handleLogout(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }
  if (!validateCsrf(request, session)) {
    return adminErrorResponse("csrf_invalid", 403);
  }
  await destroyAdminSession(env, request);
  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": clearSessionCookie(url),
    },
  );
}

async function handlePasswordChange(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }
  if (!validateCsrf(request, session)) {
    return adminErrorResponse("csrf_invalid", 403);
  }

  const payload = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }
  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";

  const result = await changeAdminPassword(env, currentPassword, newPassword);
  if (!result.ok) {
    return adminErrorResponse(result.errorCode, 400);
  }

  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": buildSessionCookie(url, result.session),
    },
  );
}

async function handleListApps(request: Request, env: Env, origin: string): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }

  return jsonResponse({
    apps: await listApps(env, origin),
  });
}

async function handleCreateApp(request: Request, env: Env, origin: string): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }
  if (!validateCsrf(request, session)) {
    return adminErrorResponse("csrf_invalid", 403);
  }

  const payload = await readJson<AppPayload>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const normalized = normalizeAppInput(payload);
  if (!normalized.ok) {
    return adminErrorResponse(normalized.errorCode, 400);
  }

  const authSettings = await resolveAuthSettings(payload, null);
  if (!authSettings.ok) {
    return adminErrorResponse(authSettings.errorCode, 400);
  }

  const timestamp = new Date().toISOString();
  const record: AppRecord = {
    id: crypto.randomUUID(),
    name: normalized.name,
    slug: normalized.slug,
    rootPrefix: normalized.rootPrefix,
    notes: normalized.notes,
    authUsername: authSettings.authUsername,
    passwordHash: authSettings.passwordHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const uniquenessError = await validateAppUniqueness(env, record);
  if (uniquenessError) {
    return adminErrorResponse(uniquenessError, 409);
  }

  await saveApp(env, record);
  await ensureCollectionExists(env, record.rootPrefix);

  return jsonResponse(
    {
      app: publicApp(record, origin),
      createdUrl: buildAppUrl(origin, record.slug),
    },
    201,
  );
}

async function handleUpdateApp(request: Request, env: Env, appId: string, origin: string): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }
  if (!validateCsrf(request, session)) {
    return adminErrorResponse("csrf_invalid", 403);
  }

  const existing = await getAppById(env, appId);
  if (!existing) {
    return adminErrorResponse("app_not_found", 404);
  }

  const payload = await readJson<AppPayload>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const normalized = normalizeAppInput(payload, existing);
  if (!normalized.ok) {
    return adminErrorResponse(normalized.errorCode, 400);
  }

  const authSettings = await resolveAuthSettings(payload, existing);
  if (!authSettings.ok) {
    return adminErrorResponse(authSettings.errorCode, 400);
  }

  const nextRecord: AppRecord = {
    ...existing,
    name: normalized.name,
    slug: normalized.slug,
    rootPrefix: normalized.rootPrefix,
    notes: normalized.notes,
    authUsername: authSettings.authUsername,
    passwordHash: authSettings.passwordHash,
    updatedAt: new Date().toISOString(),
  };

  const uniquenessError = await validateAppUniqueness(env, nextRecord, existing.id);
  if (uniquenessError) {
    return adminErrorResponse(uniquenessError, 409);
  }

  await saveApp(env, nextRecord, existing);
  await ensureCollectionExists(env, nextRecord.rootPrefix);

  return jsonResponse({
    app: publicApp(nextRecord, origin),
  });
}

async function handleDeleteApp(request: Request, env: Env, appId: string): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }
  if (!validateCsrf(request, session)) {
    return adminErrorResponse("csrf_invalid", 403);
  }

  const existing = await getAppById(env, appId);
  if (!existing) {
    return adminErrorResponse("app_not_found", 404);
  }

  let purgeData = false;
  if ((request.headers.get("content-length") ?? "0") !== "0") {
    const payload = await readJson<{ purgeData?: unknown }>(request);
    purgeData = Boolean(payload?.purgeData);
  }

  await deleteAppRecord(env, existing);

  if (purgeData) {
    const keys = await collectStorageKeys(env, existing.rootPrefix);
    if (keys.length > 0) {
      await deleteStorageKeysInBatches(env, keys);
    }
  }

  return jsonResponse({ ok: true });
}

async function requireAdminSession(env: Env, request: Request) {
  const session = await getAdminSessionFromRequest(env, request);
  if (!session) {
    return adminErrorResponse("admin_session_required", 401);
  }
  return session;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function ensureCollectionExists(env: Env, rootPrefix: string): Promise<void> {
  const markerKey = `${rootPrefix.replace(/\/$/, "")}/.cf-webdav-dir`;
  const existing = await env.WEBDAV_BUCKET.head(markerKey);
  if (!existing) {
    await env.WEBDAV_BUCKET.put(markerKey, "");
  }
}
