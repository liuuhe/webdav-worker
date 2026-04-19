import { ConfigCoordinator } from "../src/config-coordinator";
import type { Env } from "../src/types";

type StoredValue = { value: string; expiresAt?: number };
type StoredObject = {
  bytes: Uint8Array;
  uploaded: Date;
  httpEtag: string;
  httpMetadata?: Record<string, string | undefined>;
  customMetadata?: Record<string, string>;
};

type MemoryDurableObjectId = {
  name: string;
};

export class MemoryKV {
  private values = new Map<string, StoredValue>();

  async get<T = string>(key: string, type?: "text" | "json"): Promise<T | null> {
    this.evictExpired(key);
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (type === "json") {
      return JSON.parse(stored.value) as T;
    }
    return stored.value as T;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const offset = Number(options?.cursor ?? "0");
    const matching = [...this.values.keys()]
      .sort()
      .filter((key) => {
        this.evictExpired(key);
        return this.values.has(key) && key.startsWith(prefix);
      });

    const keys = matching.slice(offset, offset + limit).map((name) => ({ name }));
    const nextOffset = offset + keys.length;

    return {
      keys,
      list_complete: nextOffset >= matching.length,
      cursor: nextOffset >= matching.length ? undefined : String(nextOffset),
    };
  }

  private evictExpired(key: string): void {
    const stored = this.values.get(key);
    if (stored?.expiresAt && stored.expiresAt <= Date.now()) {
      this.values.delete(key);
    }
  }
}

export class MemoryR2 {
  private objects = new Map<string, StoredObject>();

  async head(key: string): Promise<R2Object | null> {
    const stored = this.objects.get(key);
    return stored ? this.toObject(key, stored) : null;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.objects.get(key);
    return stored ? this.toObjectBody(key, stored) : null;
  }

  async put(
    key: string,
    value: BodyInit | ReadableStream | null,
    options?: { httpMetadata?: Record<string, string | undefined>; customMetadata?: Record<string, string> },
  ): Promise<void> {
    const bytes = await bodyToBytes(value);
    const uploaded = new Date();
    this.objects.set(key, {
      bytes,
      uploaded,
      httpEtag: `"${key}-${bytes.length}-${uploaded.getTime()}"`,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    });
  }

  async delete(keys: string | string[]): Promise<void> {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        this.objects.delete(key);
      }
      return;
    }
    this.objects.delete(keys);
  }

  async list(options?: {
    prefix?: string;
    delimiter?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    objects: R2Object[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const delimiter = options?.delimiter;
    const limit = options?.limit ?? 1000;
    const offset = Number(options?.cursor ?? "0");
    const matching = [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right));

    const objects: R2Object[] = [];
    const prefixes = new Set<string>();
    let scanned = 0;

    for (const [key, stored] of matching.slice(offset)) {
      const suffix = key.slice(prefix.length);
      if (delimiter) {
        const delimiterIndex = suffix.indexOf(delimiter);
        if (delimiterIndex >= 0) {
          prefixes.add(prefix + suffix.slice(0, delimiterIndex + delimiter.length));
          scanned += 1;
          if (objects.length >= limit) {
            break;
          }
          continue;
        }
      }
      objects.push(this.toObject(key, stored));
      scanned += 1;
      if (objects.length >= limit) {
        break;
      }
    }

    const nextOffset = offset + scanned;
    const truncated = nextOffset < matching.length;

    return {
      objects,
      delimitedPrefixes: [...prefixes].sort(),
      truncated,
      cursor: truncated ? String(nextOffset) : undefined,
    };
  }

  private toObject(key: string, stored: StoredObject): R2Object {
    const httpMetadata = stored.httpMetadata ?? {};
    return {
      key,
      version: "1",
      size: stored.bytes.length,
      etag: stored.httpEtag,
      httpEtag: stored.httpEtag,
      uploaded: stored.uploaded,
      checksums: {},
      httpMetadata,
      customMetadata: stored.customMetadata,
      range: undefined,
      storageClass: "Standard",
      writeHttpMetadata(headers: Headers) {
        if (httpMetadata.contentType) headers.set("Content-Type", httpMetadata.contentType);
        if (httpMetadata.contentDisposition) headers.set("Content-Disposition", httpMetadata.contentDisposition);
        if (httpMetadata.cacheControl) headers.set("Cache-Control", httpMetadata.cacheControl);
        if (httpMetadata.contentEncoding) headers.set("Content-Encoding", httpMetadata.contentEncoding);
        if (httpMetadata.contentLanguage) headers.set("Content-Language", httpMetadata.contentLanguage);
      },
    } as unknown as R2Object;
  }

  private toObjectBody(key: string, stored: StoredObject): R2ObjectBody {
    const object = this.toObject(key, stored) as unknown as R2ObjectBody;
    object.body = new Response(stored.bytes).body;
    return object;
  }
}

class MemoryAssets {
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname === "/manage/index.html" || url.pathname.startsWith("/manage/")) {
      return new Response("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return new Response("Not found.", { status: 404 });
  }
}

class MemoryCoordinatorNamespace {
  private coordinator: ConfigCoordinator | null = null;

  constructor(private readonly envFactory: () => Env) {}

  idFromName(name: string): DurableObjectId {
    return { name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    if (!this.coordinator) {
      this.coordinator = new ConfigCoordinator({} as DurableObjectState, this.envFactory());
    }

    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return this.coordinator!.fetch(request);
      },
    } as DurableObjectStub;
  }
}

export function createEnv(adminToken = "bootstrap-secret"): Env {
  const bucket = new MemoryR2() as unknown as R2Bucket;
  const config = new MemoryKV() as unknown as KVNamespace;
  const assets = new MemoryAssets() as unknown as Fetcher;
  let env: Env;
  const coordinator = new MemoryCoordinatorNamespace(() => env) as unknown as DurableObjectNamespace;
  env = {
    WEBDAV_BUCKET: bucket,
    WEBDAV_CONFIG: config,
    CONFIG_COORDINATOR: coordinator,
    ASSETS: assets,
    ADMIN_TOKEN: adminToken,
  };
  return env;
}

export function extractSessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) {
    throw new Error("Missing session cookie.");
  }
  return header.split(";")[0];
}

export async function extractCsrfToken(
  env: Env,
  origin: string,
  sessionCookie: string,
): Promise<string> {
  const response = await fetchSessionState(env, origin, sessionCookie);
  return response.csrfToken;
}

export async function fetchSessionState(env: Env, origin: string, sessionCookie?: string) {
  const response = await (await import("../src/index")).default.fetch(
    new Request(`${origin}/manage/api/session`, {
      headers: sessionCookie ? { Cookie: sessionCookie } : undefined,
    }),
    env,
  );
  return (await response.json()) as { authenticated: boolean; adminConfigured: boolean; csrfToken: string };
}

async function bodyToBytes(value: BodyInit | ReadableStream | null): Promise<Uint8Array> {
  if (value === null) {
    return new Uint8Array();
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return new Uint8Array(await new Response(value).arrayBuffer());
}
