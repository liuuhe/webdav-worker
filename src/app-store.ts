import {
  APP_KEY_PREFIX,
  ROOT_PREFIX_KEY_PREFIX,
  TOKEN_KEY_PREFIX,
} from "./constants";
import type { AdminErrorCode, AppRecord, Env, PublicApp } from "./types";

export async function listApps(env: Env, origin: string): Promise<PublicApp[]> {
  const listing = await env.WEBDAV_CONFIG.list({ prefix: APP_KEY_PREFIX });
  const apps = await Promise.all(
    listing.keys.map(async (entry) => {
      const raw = await env.WEBDAV_CONFIG.get<Record<string, unknown>>(entry.name, "json");
      const app = hydrateAppRecord(raw);
      return app ? publicApp(app, origin) : null;
    }),
  );

  return apps
    .filter((app): app is PublicApp => Boolean(app))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

export async function getAppById(env: Env, id: string): Promise<AppRecord | null> {
  const raw = await env.WEBDAV_CONFIG.get<Record<string, unknown>>(`${APP_KEY_PREFIX}${id}`, "json");
  return hydrateAppRecord(raw);
}

export async function getAppBySlug(env: Env, slug: string): Promise<AppRecord | null> {
  const raw = await env.WEBDAV_CONFIG.get<Record<string, unknown>>(`${TOKEN_KEY_PREFIX}${slug}`, "json");
  return hydrateAppRecord(raw);
}

export async function validateAppUniqueness(
  env: Env,
  record: AppRecord,
  currentId?: string,
): Promise<AdminErrorCode | null> {
  const existingBySlug = await getAppBySlug(env, record.slug);
  if (existingBySlug && existingBySlug.id !== currentId) {
    return "path_in_use";
  }

  const existingRootOwner = await env.WEBDAV_CONFIG.get<string>(`${ROOT_PREFIX_KEY_PREFIX}${record.rootPrefix}`);
  if (existingRootOwner && existingRootOwner !== currentId) {
    return "storage_prefix_in_use";
  }

  return null;
}

export async function saveApp(env: Env, record: AppRecord, previous?: AppRecord): Promise<void> {
  const serialized = JSON.stringify(record);
  await env.WEBDAV_CONFIG.put(`${APP_KEY_PREFIX}${record.id}`, serialized);
  await env.WEBDAV_CONFIG.put(`${TOKEN_KEY_PREFIX}${record.slug}`, serialized);
  await env.WEBDAV_CONFIG.put(`${ROOT_PREFIX_KEY_PREFIX}${record.rootPrefix}`, record.id);

  if (previous && previous.slug !== record.slug) {
    await env.WEBDAV_CONFIG.delete(`${TOKEN_KEY_PREFIX}${previous.slug}`);
  }
  if (previous && previous.rootPrefix !== record.rootPrefix) {
    await env.WEBDAV_CONFIG.delete(`${ROOT_PREFIX_KEY_PREFIX}${previous.rootPrefix}`);
  }
}

export async function deleteAppRecord(env: Env, record: AppRecord): Promise<void> {
  await env.WEBDAV_CONFIG.delete(`${APP_KEY_PREFIX}${record.id}`);
  await env.WEBDAV_CONFIG.delete(`${TOKEN_KEY_PREFIX}${record.slug}`);
  await env.WEBDAV_CONFIG.delete(`${ROOT_PREFIX_KEY_PREFIX}${record.rootPrefix}`);
}

export function publicApp(app: AppRecord, origin: string): PublicApp {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    accessUrl: buildAppUrl(origin, app.slug),
    rootPrefix: app.rootPrefix,
    notes: app.notes,
    authEnabled: Boolean(app.authUsername && app.passwordHash),
    authUsername: app.authUsername ?? "",
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export function hydrateAppRecord(raw: Record<string, unknown> | null): AppRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  const slugSource =
    typeof raw.slug === "string"
      ? raw.slug
      : typeof raw.accessToken === "string"
        ? raw.accessToken
        : "";
  const rootPrefix = typeof raw.rootPrefix === "string" ? raw.rootPrefix : "";
  const notes = typeof raw.notes === "string" ? raw.notes : "";
  const authUsername = typeof raw.authUsername === "string" ? raw.authUsername : undefined;
  const passwordHash = typeof raw.passwordHash === "string" ? raw.passwordHash : undefined;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : "";
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;

  if (!id || !name || !slugSource || !rootPrefix) {
    return null;
  }

  return {
    id,
    name,
    slug: slugSource.toLowerCase(),
    rootPrefix,
    notes,
    authUsername,
    passwordHash,
    createdAt,
    updatedAt,
  };
}

export function buildAppUrl(origin: string, slug: string): string {
  return `${origin}/${slug}/`;
}
