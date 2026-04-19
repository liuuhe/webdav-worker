export const MANAGE_SEGMENT = "manage";
export const APP_KEY_PREFIX = "app:";
export const TOKEN_KEY_PREFIX = "token:";
export const ROOT_PREFIX_KEY_PREFIX = "root:";
export const DIRECTORY_MARKER = ".cf-webdav-dir";
export const ADMIN_CONFIG_KEY = "admin:config";
export const ADMIN_SESSION_PREFIX = "admin:session:";
export const ADMIN_LOGIN_ATTEMPT_PREFIX = "admin:login-attempt:";
export const SESSION_COOKIE_NAME = "webdav_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
export const LOCK_KEY_PREFIX = "lock:";

export const DAV_ALLOW = "OPTIONS, HEAD, GET, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, LOCK, UNLOCK";
export const DAV_HEADERS: HeadersInit = {
  Allow: DAV_ALLOW,
  DAV: "1, 2",
  "MS-Author-Via": "DAV",
};
