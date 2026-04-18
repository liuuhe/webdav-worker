import { describe, expect, it } from "vitest";

import { hydrateAppRecord, saveApp, validateAppUniqueness } from "../src/app-store";
import { normalizeAppInput } from "../src/app-validation";
import { parseAdminRoute, parseAppRoute } from "../src/routes";
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
