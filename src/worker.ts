import { getAppBySlug } from "./app-store";
import { handleAdminRequest } from "./admin-routes";
import { parseAdminRoute, parseAppRoute } from "./routes";
import { handleWebDavRequest } from "./webdav";
import type { AppAccess, Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const adminRoute = parseAdminRoute(url.pathname);
    if (adminRoute) {
      return handleAdminRequest(request, env, url, adminRoute);
    }

    const appRoute = parseAppRoute(url.pathname);
    if (!appRoute) {
      return new Response("Not found.", { status: 404 });
    }

    const app = await getAppBySlug(env, appRoute.token);
    if (!app) {
      return new Response("Not found.", { status: 404 });
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

    return handleWebDavRequest(request, env, url, access, appRoute.logicalPath);
  },
};
