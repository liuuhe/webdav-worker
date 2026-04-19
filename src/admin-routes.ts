import {
  buildSessionCookie,
  changeAdminPassword,
  clearSessionCookie,
  destroyAdminSession,
  getAdminSessionFromRequest,
  getAdminSessionState,
  setupAdminPassword,
  authenticateAdmin,
  validateCsrf,
} from "./admin-auth";
import {
  buildAppUrl,
  getAppById,
  listApps,
  publicApp,
} from "./app-store";
import { createAppWithCoordinator, deleteAppWithCoordinator, updateAppWithCoordinator } from "./config-coordinator";
import { MANAGE_SEGMENT } from "./constants";
import { adminErrorResponse, adminMethodNotAllowed, jsonResponse, redirectResponse } from "./http";
import type { AdminRoute, AppPayload, Env } from "./types";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  url: URL,
  route: AdminRoute,
): Promise<Response> {
  if (!route.subPath.startsWith("/api")) {
    return serveAdminApp(request, env, url, route);
  }

  if (route.subPath === "/api/session") {
    if (request.method !== "GET") {
      return adminMethodNotAllowed();
    }
    return handleSession(request, env);
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
      case "GET":
        return handleGetApp(request, env, appId, url.origin);
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

async function serveAdminApp(request: Request, env: Env, url: URL, route: AdminRoute): Promise<Response> {
  if (!env.ASSETS) {
    return new Response("Admin assets are unavailable.", {
      status: 503,
      headers: new Headers({
        "Cache-Control": "no-store",
      }),
    });
  }

  const manageRootPath = `/${MANAGE_SEGMENT}/`;
  if (route.subPath === "/") {
    const shellResponse = await env.ASSETS.fetch(new Request(new URL(manageRootPath, url).toString(), request));
    return withNoStoreForHtml(shellResponse);
  }

  const assetResponse = await env.ASSETS.fetch(new Request(url.toString(), request));
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  if (route.subPath.startsWith("/assets/") || route.subPath.endsWith(".ico") || route.subPath.endsWith(".svg")) {
    return assetResponse;
  }

  const shellResponse = await env.ASSETS.fetch(new Request(new URL(manageRootPath, url).toString(), request));
  return withNoStoreForHtml(shellResponse);
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const session = await getAdminSessionState(env, request);
  return jsonResponse(session);
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
  const payload = await readJson<{ password?: unknown }>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const password = typeof payload.password === "string" ? payload.password : "";
  const result = await authenticateAdmin(env, request, password);
  if (!result.ok) {
    const status =
      result.errorCode === "setup_required"
        ? 409
        : result.errorCode === "too_many_attempts"
          ? 429
          : 401;
    return adminErrorResponse(result.errorCode, status);
  }

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

async function handleGetApp(request: Request, env: Env, appId: string, origin: string): Promise<Response> {
  const session = await requireAdminSession(env, request);
  if (session instanceof Response) {
    return session;
  }

  const app = await getAppById(env, appId);
  if (!app) {
    return adminErrorResponse("app_not_found", 404);
  }

  return jsonResponse({
    app: publicApp(app, origin),
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

  const result = await createAppWithCoordinator(env, payload);
  if (!result.ok) {
    return adminErrorResponse(result.errorCode, result.errorCode.endsWith("_in_use") ? 409 : 400);
  }

  return jsonResponse(
    {
      app: publicApp(result.app, origin),
      createdUrl: buildAppUrl(origin, result.app.slug),
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

  const payload = await readJson<AppPayload>(request);
  if (!payload) {
    return adminErrorResponse("invalid_json", 400);
  }

  const result = await updateAppWithCoordinator(env, appId, payload);
  if (!result.ok) {
    const status = result.errorCode === "app_not_found" ? 404 : result.errorCode.endsWith("_in_use") ? 409 : 400;
    return adminErrorResponse(result.errorCode, status);
  }

  return jsonResponse({
    app: publicApp(result.app, origin),
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

  let purgeData = false;
  if ((request.headers.get("content-length") ?? "0") !== "0") {
    const payload = await readJson<{ purgeData?: unknown }>(request);
    purgeData = Boolean(payload?.purgeData);
  }

  const result = await deleteAppWithCoordinator(env, appId, purgeData);
  if (!result.ok) {
    return adminErrorResponse(result.errorCode, result.errorCode === "app_not_found" ? 404 : 400);
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

function withNoStoreForHtml(response: Response): Response {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/html")) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
