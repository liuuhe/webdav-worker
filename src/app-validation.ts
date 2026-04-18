import { MANAGE_SEGMENT } from "./constants";
import { hashPassword } from "./security";
import type { AdminErrorCode, AppPayload, AppRecord } from "./types";

export function normalizeAppInput(
  payload: AppPayload,
  existing?: AppRecord,
):
  | { ok: true; name: string; slug: string; rootPrefix: string; notes: string }
  | { ok: false; errorCode: AdminErrorCode } {
  const name = normalizeName(payload.name, existing?.name);
  const slug = normalizeSlug(payload.slug, existing?.slug);
  const rootPrefix = normalizeRootPrefix(payload.rootPrefix, existing?.rootPrefix ?? "");
  const notes = normalizeNotes(payload.notes, existing?.notes ?? "");

  if (!name.ok) {
    return name;
  }
  if (!slug.ok) {
    return slug;
  }
  if (!rootPrefix.ok) {
    return rootPrefix;
  }
  if (!notes.ok) {
    return notes;
  }

  return {
    ok: true,
    name: name.value,
    slug: slug.value,
    rootPrefix: rootPrefix.value,
    notes: notes.value,
  };
}

export function normalizeName(
  input: unknown,
  fallback?: string,
): { ok: true; value: string } | { ok: false; errorCode: AdminErrorCode } {
  const value = typeof input === "string" ? input.trim() : fallback?.trim();
  if (!value) {
    return { ok: false, errorCode: "name_required" };
  }
  if (value.length > 80) {
    return { ok: false, errorCode: "name_too_long" };
  }
  return { ok: true, value };
}

export function normalizeRootPrefix(
  input: unknown,
  fallback: string,
): { ok: true; value: string } | { ok: false; errorCode: AdminErrorCode } {
  const raw = typeof input === "string" && input.trim() ? input.trim() : fallback;
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { ok: false, errorCode: "storage_prefix_required" };
  }
  if (segments.some((segment) => !/^[a-zA-Z0-9._-]+$/.test(segment))) {
    return { ok: false, errorCode: "storage_prefix_invalid" };
  }
  return { ok: true, value: `${segments.join("/")}/` };
}

export function normalizeNotes(
  input: unknown,
  fallback = "",
): { ok: true; value: string } | { ok: false; errorCode: AdminErrorCode } {
  if (input === undefined || input === null) {
    return { ok: true, value: fallback };
  }
  if (typeof input !== "string") {
    return { ok: false, errorCode: "notes_invalid" };
  }
  return { ok: true, value: input.trim() };
}

export function normalizeSlug(
  input: unknown,
  fallback?: string,
): { ok: true; value: string } | { ok: false; errorCode: AdminErrorCode } {
  const value = typeof input === "string" ? input.trim() : fallback?.trim();
  if (!value) {
    return { ok: false, errorCode: "path_required" };
  }
  if (!/^[a-z0-9-]{2,64}$/i.test(value)) {
    return { ok: false, errorCode: "path_invalid" };
  }
  if (value.toLowerCase() === MANAGE_SEGMENT) {
    return { ok: false, errorCode: "path_reserved" };
  }
  return { ok: true, value: value.toLowerCase() };
}

export function normalizeAuthUsername(
  input: unknown,
): { ok: true; value: string } | { ok: false; errorCode: AdminErrorCode } {
  if (input === undefined || input === null) {
    return { ok: true, value: "" };
  }
  if (typeof input !== "string") {
    return { ok: false, errorCode: "username_invalid" };
  }

  const value = input.trim();
  if (!value) {
    return { ok: true, value: "" };
  }
  if (value.includes(":") || /\s/.test(value) || value.length > 64) {
    return { ok: false, errorCode: "username_format_invalid" };
  }
  return { ok: true, value };
}

export async function resolveAuthSettings(
  payload: AppPayload,
  existing: AppRecord | null,
):
  Promise<
    | { ok: true; authUsername?: string; passwordHash?: string }
    | { ok: false; errorCode: AdminErrorCode }
  > {
  const usernameResult = normalizeAuthUsername(payload.authUsername);
  if (!usernameResult.ok) {
    return usernameResult;
  }

  const rawPassword =
    payload.authPassword === undefined || payload.authPassword === null
      ? ""
      : typeof payload.authPassword === "string"
        ? payload.authPassword
        : null;

  if (rawPassword === null) {
    return { ok: false, errorCode: "password_invalid" };
  }

  const username = usernameResult.value;
  const password = rawPassword;

  if (!username && !password) {
    return { ok: true };
  }

  if (!username && password) {
    return { ok: false, errorCode: "username_required_for_password" };
  }

  if (username && !password) {
    if (existing?.authUsername && existing?.passwordHash) {
      return {
        ok: true,
        authUsername: username,
        passwordHash: existing.passwordHash,
      };
    }
    return { ok: false, errorCode: "password_required_for_auth" };
  }

  if (password.length < 1) {
    return { ok: false, errorCode: "password_empty" };
  }

  return {
    ok: true,
    authUsername: username,
    passwordHash: await hashPassword(password),
  };
}
