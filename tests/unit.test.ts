import { describe, expect, it } from "vitest";

import { hydrateAppRecord, listApps, saveApp, validateAppUniqueness } from "../src/app-store";
import { normalizeAppInput } from "../src/app-validation";
import { parseAdminRoute, parseAppRoute } from "../src/routes";
import { hashPassword, sha256Hex, verifyPassword } from "../src/security";
import { determineLockDepth, extractLockOwner, normalizeLockToken, parseTimeout } from "../src/webdav-locks";
import type { AppRecord } from "../src/types";
import { createEnv } from "./mocks";

describe("route parsing", () => {
  it("parses stable admin routes", () => {
    expect(parseAdminRoute("/manage")).toEqual({ basePath: "/manage", subPath: "/" });
    expect(parseAdminRoute("/manage/api/apps")).toEqual({ basePath: "/manage", subPath: "/api/apps" });
  });

  it("parses app routes and rejects the admin segment", () => {
    expect(parseAppRoute("/notes/doc.txt")).toEqual({
      token: "notes",
      basePath: "/notes",
      logicalPath: "/doc.txt",
    });
    expect(parseAppRoute("/manage/demo")).toBeNull();
  });
});

describe("app validation", () => {
  it("normalizes valid input", () => {
    const result = normalizeAppInput({
      name: " Demo ",
      slug: "Notes-App",
      rootPrefix: "/notes/app/",
      notes: "  keep ",
    });
    expect(result).toEqual({
      ok: true,
      name: "Demo",
      slug: "notes-app",
      rootPrefix: "notes/app/",
      notes: "keep",
    });
  });

  it("rejects invalid reserved paths", () => {
    const result = normalizeAppInput({
      name: "Demo",
      slug: "manage",
      rootPrefix: "notes",
    });
    expect(result).toEqual({
      ok: false,
      errorCode: "path_reserved",
    });
  });
});

describe("app storage", () => {
  it("hydrates legacy records with accessToken", () => {
    const record = hydrateAppRecord({
      id: "1",
      name: "Legacy",
      accessToken: "legacy-path",
      rootPrefix: "legacy/",
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(record?.slug).toBe("legacy-path");
  });

  it("uses dedicated slug and rootPrefix indexes for uniqueness", async () => {
    const env = createEnv();
    const record: AppRecord = {
      id: "app-1",
      name: "Primary",
      slug: "primary",
      rootPrefix: "primary/",
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await saveApp(env, record);

    await expect(
      validateAppUniqueness(env, {
        ...record,
        id: "app-2",
        slug: "secondary",
      }),
    ).resolves.toBe("storage_prefix_in_use");

    await expect(
      validateAppUniqueness(env, {
        ...record,
        id: "app-2",
        rootPrefix: "secondary/",
      }),
    ).resolves.toBe("path_in_use");
  });

  it("lists apps across KV cursors", async () => {
    const env = createEnv();

    for (let index = 0; index < 1005; index += 1) {
      await saveApp(env, {
        id: `app-${index}`,
        name: `App ${String(index).padStart(4, "0")}`,
        slug: `app-${index}`,
        rootPrefix: `apps/${index}/`,
        notes: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    const apps = await listApps(env, "https://example.com");

    expect(apps).toHaveLength(1005);
    expect(apps[0]?.slug).toBe("app-0");
    expect(apps[1004]?.slug).toBe("app-1004");
  });
});

describe("password hashing", () => {
  it("verifies modern hashes without forcing a rehash", async () => {
    const hash = await hashPassword("secret-pass");
    const verification = await verifyPassword("secret-pass", hash);

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.upgradedHash).toBeUndefined();
    }
  });

  it("accepts legacy hashes and returns an upgraded hash", async () => {
    const legacyHash = await sha256Hex("legacy-pass");
    const verification = await verifyPassword("legacy-pass", legacyHash);

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.upgradedHash).toMatch(/^pbkdf2_sha256\$/);
    }
  });
});

describe("webdav lock helpers", () => {
  it("parses namespaced owners and normalizes lock headers", () => {
    expect(
      extractLockOwner(
        '<d:owner xmlns:d="DAV:"><d:href>https://example.com/owners/tester</d:href></d:owner>',
      ),
    ).toBe("<d:href>https://example.com/owners/tester</d:href>");
    expect(normalizeLockToken("<urn:uuid:demo-token>")).toBe("demo-token");
  });

  it("derives default depth and timeout values for locks", () => {
    expect(determineLockDepth(true, null)).toBe("infinity");
    expect(determineLockDepth(false, null)).toBe("0");
    expect(determineLockDepth(true, "1")).toBeNull();

    const infiniteTimeout = parseTimeout("Infinite");
    expect(infiniteTimeout.timeout).toBe("Infinite");
    expect(infiniteTimeout.expiresAt).toBeGreaterThan(Date.now());

    const cappedTimeout = parseTimeout("Second-999999999");
    expect(cappedTimeout.timeout).toBe("Second-31536000");
  });
});
