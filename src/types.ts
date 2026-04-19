export interface Env {
  WEBDAV_BUCKET: R2Bucket;
  WEBDAV_CONFIG: KVNamespace;
  CONFIG_COORDINATOR: DurableObjectNamespace;
  ASSETS?: Fetcher;
  ADMIN_TOKEN?: string;
}

export interface AppRecord {
  id: string;
  name: string;
  slug: string;
  rootPrefix: string;
  notes: string;
  authUsername?: string;
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppAccess {
  appId: string;
  appName: string;
  slug: string;
  rootPrefix: string;
  basePath: string;
  authUsername?: string;
  passwordHash?: string;
}

export type Resource =
  | { kind: "collection"; key: string; marker?: R2Object | null }
  | { kind: "file"; key: string; object: R2Object };

export interface AppPayload {
  name?: unknown;
  slug?: unknown;
  rootPrefix?: unknown;
  notes?: unknown;
  authUsername?: unknown;
  authPassword?: unknown;
}

export interface PublicApp {
  id: string;
  name: string;
  slug: string;
  accessUrl: string;
  rootPrefix: string;
  notes: string;
  authEnabled: boolean;
  authUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminConfigRecord {
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSessionState {
  authenticated: boolean;
  adminConfigured: boolean;
  csrfToken: string;
}

export interface AdminLoginAttemptRecord {
  count: number;
}

export interface AdminSessionRecord {
  id: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
}

export interface AdminPageState {
  authenticated: boolean;
  adminConfigured: boolean;
  csrfToken: string;
  accessPath: string;
}

export interface LockDetails {
  token: string;
  owner?: string;
  scope: "exclusive" | "shared";
  depth: "0" | "infinity";
  timeout: string;
  expiresAt: number;
  rootKey: string;
}

export type AdminErrorCode =
  | "invalid_json"
  | "internal_error"
  | "app_not_found"
  | "path_in_use"
  | "storage_prefix_in_use"
  | "name_required"
  | "name_too_long"
  | "storage_prefix_required"
  | "storage_prefix_invalid"
  | "notes_invalid"
  | "path_required"
  | "path_invalid"
  | "path_reserved"
  | "username_invalid"
  | "username_format_invalid"
  | "password_invalid"
  | "username_required_for_password"
  | "password_required_for_auth"
  | "password_empty"
  | "invalid_credentials"
  | "setup_required"
  | "already_configured"
  | "current_password_invalid"
  | "new_password_required"
  | "bootstrap_token_invalid"
  | "too_many_attempts"
  | "admin_session_required"
  | "csrf_invalid";

export interface AppRoute {
  token: string;
  basePath: string;
  logicalPath: string;
}

export interface AdminRoute {
  basePath: string;
  subPath: string;
}
