export const MANAGE_SEGMENT = "manage";
export const APP_KEY_PREFIX = "app:";
export const TOKEN_KEY_PREFIX = "token:";
export const ROOT_PREFIX_KEY_PREFIX = "root:";
export const DIRECTORY_MARKER = ".cf-webdav-dir";
export const ADMIN_CONFIG_KEY = "admin:config";
export const ADMIN_SESSION_PREFIX = "admin:session:";
export const SESSION_COOKIE_NAME = "webdav_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const DAV_ALLOW = "OPTIONS, HEAD, GET, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND";
export const DAV_HEADERS: HeadersInit = {
  Allow: DAV_ALLOW,
  DAV: "1",
  "MS-Author-Via": "DAV",
};
