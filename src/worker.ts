import { getAppBySlug, saveApp } from "./app-store";
import { handleAdminRequest } from "./admin-routes";
import { REQUEST_ID_HEADER } from "./constants";
import { upgradeAppPasswordHashWithCoordinator } from "./config-coordinator";
import { adminErrorResponse } from "./http";
import { parseAdminRoute, parseAppRoute } from "./routes";
import { authorizeAppRequest, unauthorizedWebDav } from "./security";
import { baseHeaders, handleWebDavRequest } from "./webdav";
import type { AppAccess, Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? request.headers.get("cf-ray") ?? crypto.randomUUID();
    const startedAt = Date.now();
    let routeKind: "admin" | "webdav" | "unknown" = "unknown";
    let appSlug = "";
    let response: Response | undefined;
    let errorName: string | undefined;
    let errorMessage: string | undefined;

    try {
      const adminRoute = parseAdminRoute(url.pathname);
      if (adminRoute) {
        routeKind = "admin";
        response = await handleAdminRequest(request, env, url, adminRoute);
        return withRequestId(response, requestId);
      }

      const appRoute = parseAppRoute(url.pathname);
      if (!appRoute) {
        response = new Response("Not found.", { status: 404 });
        return withRequestId(response, requestId);
      }

      routeKind = "webdav";
      appSlug = appRoute.token;

      let app = await getAppBySlug(env, appRoute.token);
      if (!app) {
        response = new Response("Not found.", { status: 404 });
        return withRequestId(response, requestId);
      }

      const authResult = await authorizeAppRequest(request, {
        appId: app.id,
        appName: app.name,
        slug: app.slug,
        rootPrefix: app.rootPrefix,
        basePath: appRoute.basePath,
        authUsername: app.authUsername,
        passwordHash: app.passwordHash,
      });
      if (!authResult.authorized) {
        response = unauthorizedWebDav(app.name);
        return withRequestId(response, requestId);
      }

      if (authResult.upgradedPasswordHash && authResult.upgradedPasswordHash !== app.passwordHash) {
        const upgradeResult = await upgradeAppPasswordHashWithCoordinator(
          env,
          app.id,
          app.passwordHash,
          authResult.upgradedPasswordHash,
        );
        if (upgradeResult.ok) {
          app = upgradeResult.app;
        } else {
          app = {
            ...app,
            passwordHash: authResult.upgradedPasswordHash,
            updatedAt: new Date().toISOString(),
          };
          await saveApp(env, app);
        }
      }

      const access: AppAccess = {
        appId: app.id,
        appName: app.name,
        slug: app.slug,
        rootPrefix: app.rootPrefix,
        basePath: appRoute.basePath,
        authUsername: app.authUsername,
        passwordHash: app.passwordHash,
      };

      response = await handleWebDavRequest(request, env, url, access, appRoute.logicalPath);
      return withRequestId(response, requestId);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      errorName = normalized.name;
      errorMessage = normalized.message;
      response =
        routeKind === "admin"
          ? adminErrorResponse("internal_error", 500)
          : new Response("Internal server error.", {
              status: 500,
              headers: routeKind === "webdav" ? baseHeaders() : undefined,
            });
      return withRequestId(response, requestId);
    } finally {
      console.log(
        JSON.stringify({
          request_id: requestId,
          route_kind: routeKind,
          method: request.method,
          path: url.pathname,
          app_slug: appSlug || undefined,
          duration_ms: Date.now() - startedAt,
          status: response?.status,
          error_name: errorName,
          error_message: errorMessage,
        }),
      );
    }
  },
};

function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
