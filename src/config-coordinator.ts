import {
  ADMIN_CONFIG_KEY,
  ADMIN_LOGIN_ATTEMPT_PREFIX,
  ADMIN_SESSION_PREFIX,
  APP_KEY_PREFIX,
  CONFIG_COORDINATOR_NAME,
  DIRECTORY_MARKER,
  LOCK_KEY_PREFIX,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_SECONDS,
  ROOT_PREFIX_KEY_PREFIX,
  SESSION_TTL_SECONDS,
  TOKEN_KEY_PREFIX,
} from "./constants";
import { deleteAppRecord, getAppById, saveApp, validateAppUniqueness } from "./app-store";
import { normalizeAppInput, resolveAuthSettings } from "./app-validation";
import { collectStorageKeys, deleteStorageKeysInBatches } from "./webdav-store";
import { hashPassword, sha256Hex, verifyPassword } from "./security";
import type {
  AdminConfigRecord,
  AdminErrorCode,
  AdminLoginAttemptRecord,
  AdminSessionRecord,
  AppPayload,
  AppRecord,
  Env,
} from "./types";

type Result<T> = { ok: true } & T | { ok: false; errorCode: AdminErrorCode };

type AppMutationPayload = {
  payload: AppPayload;
};

type DeleteAppPayload = {
  purgeData?: boolean;
};

type LoginPayload = {
  fingerprint: string;
  password: string;
};

type PasswordSetupPayload = {
  bootstrapToken: string;
  newPassword: string;
};

type PasswordChangePayload = {
  currentPassword: string;
  newPassword: string;
};

type SessionPayload = {
  sessionId: string;
};

type PasswordUpgradePayload = {
  appId: string;
  previousHash?: string;
  upgradedHash: string;
};

export class ConfigCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/admin/setup") {
      return Response.json(await this.setupAdminPassword(await readJson<PasswordSetupPayload>(request)));
    }

    if (request.method === "POST" && url.pathname === "/admin/login") {
      return Response.json(await this.authenticateAdmin(await readJson<LoginPayload>(request)));
    }

    if (request.method === "POST" && url.pathname === "/admin/password") {
      return Response.json(await this.changeAdminPassword(await readJson<PasswordChangePayload>(request)));
    }

    if (request.method === "POST" && url.pathname === "/admin/logout") {
      return Response.json(await this.destroyAdminSession(await readJson<SessionPayload>(request)));
    }

    if (request.method === "POST" && url.pathname === "/apps") {
      return Response.json(await this.createApp(await readJson<AppMutationPayload>(request)));
    }

    if (request.method === "PUT" && url.pathname.startsWith("/apps/")) {
      return Response.json(await this.updateApp(decodeURIComponent(url.pathname.slice("/apps/".length)), await readJson<AppMutationPayload>(request)));
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/apps/")) {
      return Response.json(
        await this.deleteApp(
          decodeURIComponent(url.pathname.slice("/apps/".length)),
          (await readJson<DeleteAppPayload>(request)) ?? {},
        ),
      );
    }

    if (request.method === "POST" && url.pathname === "/apps/password-upgrade") {
      return Response.json(await this.upgradeAppPasswordHash(await readJson<PasswordUpgradePayload>(request)));
    }

    return new Response("Not found.", { status: 404 });
  }

  private async setupAdminPassword(
    payload: PasswordSetupPayload | null,
  ): Promise<Result<{ session: AdminSessionRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }
    if (await this.isAdminConfigured()) {
      return { ok: false, errorCode: "already_configured" };
    }
    if (!payload.newPassword.trim()) {
      return { ok: false, errorCode: "new_password_required" };
    }
    if (!this.env.ADMIN_TOKEN || payload.bootstrapToken !== this.env.ADMIN_TOKEN) {
      return { ok: false, errorCode: "bootstrap_token_invalid" };
    }

    const now = new Date().toISOString();
    await this.env.WEBDAV_CONFIG.put(
      ADMIN_CONFIG_KEY,
      JSON.stringify({
        passwordHash: await hashPassword(payload.newPassword),
        createdAt: now,
        updatedAt: now,
      } satisfies AdminConfigRecord),
    );

    return {
      ok: true,
      session: await this.createAdminSession(),
    };
  }

  private async authenticateAdmin(
    payload: LoginPayload | null,
  ): Promise<Result<{ session: AdminSessionRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    const config = await this.getAdminConfig();
    if (!config) {
      return { ok: false, errorCode: "setup_required" };
    }

    const attemptKey = await loginAttemptKey(payload.fingerprint);
    const attempts = await this.getLoginAttempts(attemptKey);
    if (attempts.count >= LOGIN_ATTEMPT_LIMIT) {
      return { ok: false, errorCode: "too_many_attempts" };
    }

    const verification = await verifyPassword(payload.password, config.passwordHash);
    if (!verification.ok) {
      const nextAttempts = {
        count: attempts.count + 1,
      } satisfies AdminLoginAttemptRecord;
      await this.env.WEBDAV_CONFIG.put(attemptKey, JSON.stringify(nextAttempts), {
        expirationTtl: LOGIN_ATTEMPT_WINDOW_SECONDS,
      });
      return {
        ok: false,
        errorCode: nextAttempts.count >= LOGIN_ATTEMPT_LIMIT ? "too_many_attempts" : "invalid_credentials",
      };
    }

    await this.env.WEBDAV_CONFIG.delete(attemptKey);

    if (verification.upgradedHash) {
      await this.env.WEBDAV_CONFIG.put(
        ADMIN_CONFIG_KEY,
        JSON.stringify({
          ...config,
          passwordHash: verification.upgradedHash,
          updatedAt: new Date().toISOString(),
        } satisfies AdminConfigRecord),
      );
    }

    return {
      ok: true,
      session: await this.createAdminSession(),
    };
  }

  private async changeAdminPassword(
    payload: PasswordChangePayload | null,
  ): Promise<Result<{ session: AdminSessionRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    const config = await this.getAdminConfig();
    if (!config) {
      return { ok: false, errorCode: "setup_required" };
    }

    const verification = await verifyPassword(payload.currentPassword, config.passwordHash);
    if (!verification.ok) {
      return { ok: false, errorCode: "current_password_invalid" };
    }
    if (!payload.newPassword.trim()) {
      return { ok: false, errorCode: "new_password_required" };
    }

    await this.env.WEBDAV_CONFIG.put(
      ADMIN_CONFIG_KEY,
      JSON.stringify({
        ...config,
        passwordHash: await hashPassword(payload.newPassword),
        updatedAt: new Date().toISOString(),
      } satisfies AdminConfigRecord),
    );
    await this.destroyAllAdminSessions();

    return {
      ok: true,
      session: await this.createAdminSession(),
    };
  }

  private async destroyAdminSession(
    payload: SessionPayload | null,
  ): Promise<{ ok: true } | { ok: false; errorCode: AdminErrorCode }> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    if (payload.sessionId) {
      await this.env.WEBDAV_CONFIG.delete(`${ADMIN_SESSION_PREFIX}${payload.sessionId}`);
    }
    return { ok: true };
  }

  private async createApp(payload: AppMutationPayload | null): Promise<Result<{ app: AppRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    const normalized = normalizeAppInput(payload.payload);
    if (!normalized.ok) {
      return normalized;
    }

    const authSettings = await resolveAuthSettings(payload.payload, null);
    if (!authSettings.ok) {
      return authSettings;
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

    const uniquenessError = await validateAppUniqueness(this.env, record);
    if (uniquenessError) {
      return { ok: false, errorCode: uniquenessError };
    }

    await saveApp(this.env, record);
    await ensureCollectionExists(this.env, record.rootPrefix);

    return { ok: true, app: record };
  }

  private async updateApp(appId: string, payload: AppMutationPayload | null): Promise<Result<{ app: AppRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    const existing = await getAppById(this.env, appId);
    if (!existing) {
      return { ok: false, errorCode: "app_not_found" };
    }

    const normalized = normalizeAppInput(payload.payload, existing);
    if (!normalized.ok) {
      return normalized;
    }

    const authSettings = await resolveAuthSettings(payload.payload, existing);
    if (!authSettings.ok) {
      return authSettings;
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

    const uniquenessError = await validateAppUniqueness(this.env, nextRecord, existing.id);
    if (uniquenessError) {
      return { ok: false, errorCode: uniquenessError };
    }

    await saveApp(this.env, nextRecord, existing);
    await ensureCollectionExists(this.env, nextRecord.rootPrefix);

    return { ok: true, app: nextRecord };
  }

  private async deleteApp(
    appId: string,
    payload: DeleteAppPayload,
  ): Promise<{ ok: true } | { ok: false; errorCode: AdminErrorCode }> {
    const existing = await getAppById(this.env, appId);
    if (!existing) {
      return { ok: false, errorCode: "app_not_found" };
    }

    await deleteAppRecord(this.env, existing);
    await deleteAllLockRecordsForApp(this.env, existing.id);

    if (payload.purgeData) {
      const keys = await collectStorageKeys(this.env, existing.rootPrefix);
      if (keys.length > 0) {
        await deleteStorageKeysInBatches(this.env, keys);
      }
    }

    return { ok: true };
  }

  private async upgradeAppPasswordHash(
    payload: PasswordUpgradePayload | null,
  ): Promise<Result<{ app: AppRecord }>> {
    if (!payload) {
      return { ok: false, errorCode: "invalid_json" };
    }

    const existing = await getAppById(this.env, payload.appId);
    if (!existing) {
      return { ok: false, errorCode: "app_not_found" };
    }

    if (existing.passwordHash === payload.upgradedHash) {
      return { ok: true, app: existing };
    }
    if (payload.previousHash && existing.passwordHash !== payload.previousHash) {
      return { ok: true, app: existing };
    }

    const nextRecord: AppRecord = {
      ...existing,
      passwordHash: payload.upgradedHash,
      updatedAt: new Date().toISOString(),
    };
    await saveApp(this.env, nextRecord, existing);
    return { ok: true, app: nextRecord };
  }

  private async getAdminConfig(): Promise<AdminConfigRecord | null> {
    return (await this.env.WEBDAV_CONFIG.get<AdminConfigRecord>(ADMIN_CONFIG_KEY, "json")) ?? null;
  }

  private async isAdminConfigured(): Promise<boolean> {
    return Boolean((await this.getAdminConfig())?.passwordHash);
  }

  private async createAdminSession(): Promise<AdminSessionRecord> {
    const now = Date.now();
    const record: AdminSessionRecord = {
      id: crypto.randomUUID(),
      csrfToken: crypto.randomUUID(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
    };

    await this.env.WEBDAV_CONFIG.put(`${ADMIN_SESSION_PREFIX}${record.id}`, JSON.stringify(record), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
    return record;
  }

  private async destroyAllAdminSessions(): Promise<void> {
    let cursor: string | undefined;
    do {
      const listing = await this.env.WEBDAV_CONFIG.list({
        prefix: ADMIN_SESSION_PREFIX,
        cursor,
      } as KVNamespaceListOptions);
      await Promise.all(listing.keys.map((entry) => this.env.WEBDAV_CONFIG.delete(entry.name)));
      cursor = listing.list_complete ? undefined : listing.cursor;
    } while (cursor);
  }

  private async getLoginAttempts(key: string): Promise<AdminLoginAttemptRecord> {
    return (await this.env.WEBDAV_CONFIG.get<AdminLoginAttemptRecord>(key, "json")) ?? { count: 0 };
  }
}

export async function setupAdminPasswordWithCoordinator(
  env: Env,
  bootstrapToken: string,
  newPassword: string,
): Promise<Result<{ session: AdminSessionRecord }>> {
  return invokeCoordinator(env, "/admin/setup", {
    method: "POST",
    body: { bootstrapToken, newPassword },
  });
}

export async function authenticateAdminWithCoordinator(
  env: Env,
  fingerprint: string,
  password: string,
): Promise<Result<{ session: AdminSessionRecord }>> {
  return invokeCoordinator(env, "/admin/login", {
    method: "POST",
    body: { fingerprint, password },
  });
}

export async function changeAdminPasswordWithCoordinator(
  env: Env,
  currentPassword: string,
  newPassword: string,
): Promise<Result<{ session: AdminSessionRecord }>> {
  return invokeCoordinator(env, "/admin/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

export async function destroyAdminSessionWithCoordinator(
  env: Env,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; errorCode: AdminErrorCode }> {
  return invokeCoordinator(env, "/admin/logout", {
    method: "POST",
    body: { sessionId },
  });
}

export async function createAppWithCoordinator(env: Env, payload: AppPayload): Promise<Result<{ app: AppRecord }>> {
  return invokeCoordinator(env, "/apps", {
    method: "POST",
    body: { payload },
  });
}

export async function updateAppWithCoordinator(
  env: Env,
  appId: string,
  payload: AppPayload,
): Promise<Result<{ app: AppRecord }>> {
  return invokeCoordinator(env, `/apps/${encodeURIComponent(appId)}`, {
    method: "PUT",
    body: { payload },
  });
}

export async function deleteAppWithCoordinator(
  env: Env,
  appId: string,
  purgeData = false,
): Promise<{ ok: true } | { ok: false; errorCode: AdminErrorCode }> {
  return invokeCoordinator(env, `/apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
    body: { purgeData },
  });
}

export async function upgradeAppPasswordHashWithCoordinator(
  env: Env,
  appId: string,
  previousHash: string | undefined,
  upgradedHash: string,
): Promise<Result<{ app: AppRecord }>> {
  return invokeCoordinator(env, "/apps/password-upgrade", {
    method: "POST",
    body: { appId, previousHash, upgradedHash },
  });
}

async function invokeCoordinator<T>(
  env: Env,
  path: string,
  init: { method: string; body: unknown },
): Promise<T> {
  const id = env.CONFIG_COORDINATOR.idFromName(CONFIG_COORDINATOR_NAME);
  const stub = env.CONFIG_COORDINATOR.get(id);
  const response = await stub.fetch(`https://config-coordinator${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(init.body),
  });

  if (!response.ok) {
    throw new Error(`Coordinator request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function ensureCollectionExists(env: Env, rootPrefix: string): Promise<void> {
  const markerKey = `${rootPrefix.replace(/\/$/, "")}/${DIRECTORY_MARKER}`;
  const existing = await env.WEBDAV_BUCKET.head(markerKey);
  if (!existing) {
    await env.WEBDAV_BUCKET.put(markerKey, "");
  }
}

async function deleteAllLockRecordsForApp(env: Env, appId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listing = await env.WEBDAV_CONFIG.list({
      prefix: `${LOCK_KEY_PREFIX}${appId}:`,
      cursor,
    } as KVNamespaceListOptions);
    await Promise.all(listing.keys.map((entry) => env.WEBDAV_CONFIG.delete(entry.name)));
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);
}

async function loginAttemptKey(fingerprint: string): Promise<string> {
  return `${ADMIN_LOGIN_ATTEMPT_PREFIX}${await sha256Hex(fingerprint)}`;
}
