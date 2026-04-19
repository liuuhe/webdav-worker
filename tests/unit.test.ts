import { describe, expect, it } from "vitest";

import { hydrateAppRecord, saveApp, validateAppUniqueness } from "../src/app-store";
import { normalizeAppInput } from "../src/app-validation";
import { parseAdminRoute, parseAppRoute } from "../src/routes";
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
