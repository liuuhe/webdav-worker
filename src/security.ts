import { DAV_HEADERS } from "./constants";
import type { AppAccess } from "./types";

const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 60000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const derivedKey = await derivePasswordKey(password, salt, PASSWORD_HASH_ITERATIONS);
  return [
    PASSWORD_HASH_PREFIX,
    String(PASSWORD_HASH_ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(derivedKey),
  ].join("$");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(
  password: string,
  storedHash: string | undefined,
): Promise<{ ok: true; upgradedHash?: string } | { ok: false }> {
  if (!storedHash) {
    return { ok: false };
  }

  const parsed = parsePasswordHash(storedHash);
  if (!parsed) {
    const legacyDigest = await sha256Hex(password);
    if (!timingSafeEqualBytes(new TextEncoder().encode(legacyDigest), new TextEncoder().encode(storedHash))) {
      return { ok: false };
    }
    return {
      ok: true,
      upgradedHash: await hashPassword(password),
    };
  }

  const derivedKey = await derivePasswordKey(password, parsed.salt, parsed.iterations);
  if (!timingSafeEqualBytes(derivedKey, parsed.hash)) {
    return { ok: false };
  }

  if (parsed.iterations < PASSWORD_HASH_ITERATIONS) {
    return {
      ok: true,
      upgradedHash: await hashPassword(password),
    };
  }

  return { ok: true };
}

export function parseBasicAuth(request: Request): { username: string; password: string } | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) {
    return null;
  }

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return null;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export async function authorizeAppRequest(
  request: Request,
  access: AppAccess,
): Promise<{ authorized: true; upgradedPasswordHash?: string } | { authorized: false }> {
  if (!access.authUsername || !access.passwordHash) {
    return { authorized: true };
  }

  const credentials = parseBasicAuth(request);
  if (!credentials || credentials.username !== access.authUsername) {
    return { authorized: false };
  }

  const verification = await verifyPassword(credentials.password, access.passwordHash);
  if (!verification.ok) {
    return { authorized: false };
  }

  return {
    authorized: true,
    upgradedPasswordHash: verification.upgradedHash,
  };
}

export function unauthorizedWebDav(realm: string): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: new Headers({
      "WWW-Authenticate": `Basic realm="${realm}"`,
      ...DAV_HEADERS,
    }),
  });
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    PASSWORD_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function parsePasswordHash(
  storedHash: string,
): { iterations: number; salt: Uint8Array; hash: Uint8Array } | null {
  const [prefix, iterationsRaw, saltRaw, hashRaw] = storedHash.split("$");
  if (prefix !== PASSWORD_HASH_PREFIX || !iterationsRaw || !saltRaw || !hashRaw) {
    return null;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return null;
  }

  try {
    const salt = decodeBase64Url(saltRaw);
    const hash = decodeBase64Url(hashRaw);
    if (salt.length === 0 || hash.length === 0) {
      return null;
    }
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}
