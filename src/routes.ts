import { MANAGE_SEGMENT } from "./constants";
import type { AdminRoute, AppRoute } from "./types";

export function parseAdminRoute(pathname: string): AdminRoute | null {
  const prefix = `/${MANAGE_SEGMENT}`;
  if (pathname === prefix) {
    return { basePath: prefix, subPath: "/" };
  }
  if (pathname.startsWith(`${prefix}/`)) {
    return { basePath: prefix, subPath: pathname.slice(prefix.length) || "/" };
  }
  return null;
}

export function parseAppRoute(pathname: string): AppRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const firstSegment = decodeURIComponent(parts[0] ?? "");
  if (firstSegment === MANAGE_SEGMENT || !/^[a-zA-Z0-9-]{2,64}$/.test(firstSegment)) {
    return null;
  }

  const basePath = `/${parts[0]}`;
  const logicalPath = pathname.slice(basePath.length) || "/";
  return {
    token: firstSegment,
    basePath,
    logicalPath,
  };
}
