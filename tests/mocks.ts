import type { Env } from "../src/types";

type StoredValue = { value: string; expiresAt?: number };
type StoredObject = {
  bytes: Uint8Array;
  uploaded: Date;
  httpEtag: string;
  httpMetadata?: Record<string, string | undefined>;
  customMetadata?: Record<string, string>;
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

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    const prefix = options?.prefix ?? "";
    const keys: Array<{ name: string }> = [];
    for (const key of [...this.values.keys()].sort()) {
      this.evictExpired(key);
      if (this.values.has(key) && key.startsWith(prefix)) {
        keys.push({ name: key });
      }
    }
    return {
      keys,
      list_complete: true,
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
    const matching = [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right));

    const objects: R2Object[] = [];
    const prefixes = new Set<string>();
    for (const [key, stored] of matching) {
      const suffix = key.slice(prefix.length);
      if (delimiter) {
        const delimiterIndex = suffix.indexOf(delimiter);
        if (delimiterIndex >= 0) {
          prefixes.add(prefix + suffix.slice(0, delimiterIndex + delimiter.length));
          continue;
        }
      }
      objects.push(this.toObject(key, stored));
      if (objects.length >= limit) {
        break;
      }
    }

    return {
      objects,
      delimitedPrefixes: [...prefixes].sort(),
      truncated: false,
      cursor: undefined,
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

export function createEnv(adminToken = "bootstrap-secret"): Env {
  return {
    WEBDAV_BUCKET: new MemoryR2() as unknown as R2Bucket,
    WEBDAV_CONFIG: new MemoryKV() as unknown as KVNamespace,
    ADMIN_TOKEN: adminToken,
  };
}

export function extractSessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) {
    throw new Error("Missing session cookie.");
  }
  return header.split(";")[0];
}

export function extractCsrfToken(html: string): string {
  const match = html.match(/"csrfToken":"([^"]+)"/);
  if (!match) {
    throw new Error("Missing CSRF token in HTML.");
  }
  return match[1];
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
