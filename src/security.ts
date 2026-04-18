import { DAV_HEADERS } from "./constants";
import type { AppAccess } from "./types";

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

export async function isAuthorizedForApp(request: Request, access: AppAccess): Promise<boolean> {
  if (!access.authUsername || !access.passwordHash) {
    return true;
  }

  const credentials = parseBasicAuth(request);
  if (!credentials || credentials.username !== access.authUsername) {
    return false;
  }

  return (await hashPassword(credentials.password)) === access.passwordHash;
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
