import { describe, expect, it } from "vitest";

import { getAppById, saveApp } from "../src/app-store";
import { ADMIN_CONFIG_KEY } from "../src/constants";
import { sha256Hex } from "../src/security";
import worker from "../src/index";
import type { AppRecord } from "../src/types";
import { createEnv, extractCsrfToken, extractSessionCookie } from "./mocks";

const EXCLUSIVE_LOCK_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:lockinfo xmlns:d="DAV:">
  <d:lockscope><d:exclusive/></d:lockscope>
  <d:locktype><d:write/></d:locktype>
  <d:owner><d:href>https://example.com/owners/tester</d:href></d:owner>
</d:lockinfo>`;

async function bootstrapAdmin(env: ReturnType<typeof createEnv>, origin: string): Promise<{
  sessionCookie: string;
  csrfToken: string;
}> {
  const setupResponse = await worker.fetch(
    new Request(origin + "/manage/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bootstrapToken: "bootstrap-secret",
        newPassword: "admin-pass",
      }),
    }),
    env,
  );
  expect(setupResponse.status).toBe(200);

  const sessionCookie = extractSessionCookie(setupResponse);
  return {
    sessionCookie,
    csrfToken: await extractCsrfToken(env, origin, sessionCookie),
  };
}

async function createApp(
  env: ReturnType<typeof createEnv>,
  origin: string,
  sessionCookie: string,
  csrfToken: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const createResponse = await worker.fetch(
    new Request(origin + "/manage/api/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: sessionCookie,
      },
      body: JSON.stringify(payload),
    }),
    env,
  );
  expect(createResponse.status).toBe(201);
}

function extractLockToken(response: Response): string {
  const token = response.headers.get("Lock-Token");
  expect(token).toBeTruthy();
  return token!;
}

function countXmlResponses(xml: string): number {
  return xml.match(/<d:response>/g)?.length ?? 0;
}

describe("worker integration", () => {
  it("serves the admin shell and reports session state", async () => {
    const env = createEnv();
    const origin = "https://example.com";

    const shellResponse = await worker.fetch(new Request(origin + "/manage"), env);
    expect(shellResponse.status).toBe(200);
    expect(shellResponse.headers.get("cache-control")).toContain("no-store");
    expect(await shellResponse.text()).toContain('<div id="root"></div>');

    const anonymousSessionResponse = await worker.fetch(new Request(origin + "/manage/api/session"), env);
    expect(anonymousSessionResponse.status).toBe(200);
    expect(await anonymousSessionResponse.json()).toEqual({
      authenticated: false,
      adminConfigured: false,
      csrfToken: "",
    });

    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    const authenticatedSessionResponse = await worker.fetch(
      new Request(origin + "/manage/api/session", {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      env,
    );
    expect(authenticatedSessionResponse.status).toBe(200);
    expect(await authenticatedSessionResponse.json()).toEqual({
      authenticated: true,
      adminConfigured: true,
      csrfToken,
    });
  });

  it("serves /manage/ without self-redirect loops when assets canonicalize index.html", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    env.ASSETS = {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const request = input instanceof Request ? input : new Request(input, init);
        const pathname = new URL(request.url).pathname;
        if (pathname === "/manage/index.html") {
          return new Response(null, {
            status: 307,
            headers: {
              Location: "/manage/",
            },
          });
        }
        if (pathname === "/manage/" || pathname.startsWith("/manage/assets/")) {
          return new Response("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
          });
        }
        return new Response("Not found.", { status: 404 });
      },
    } as unknown as Fetcher;

    const shellResponse = await worker.fetch(new Request(origin + "/manage/"), env);
    expect(shellResponse.status).toBe(200);
    expect(shellResponse.headers.get("cache-control")).toContain("no-store");
    expect(await shellResponse.text()).toContain('<div id="root"></div>');
  });

  it("supports admin setup, app creation, and WebDAV CRUD/COPY/MOVE", async () => {
    const env = createEnv();
    const origin = "https://example.com";

    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);
    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Notes",
      slug: "notes",
      rootPrefix: "notes/",
      notes: "Demo",
    });

    const mkcolResponse = await worker.fetch(new Request(origin + "/notes/docs/", { method: "MKCOL" }), env);
    expect(mkcolResponse.status).toBe(201);

    const putResponse = await worker.fetch(
      new Request(origin + "/notes/docs/file.txt", {
        method: "PUT",
        body: "hello world",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(putResponse.status).toBe(201);

    const copyResponse = await worker.fetch(
      new Request(origin + "/notes/docs/file.txt", {
        method: "COPY",
        headers: {
          Destination: origin + "/notes/docs/file-copy.txt",
        },
      }),
      env,
    );
    expect(copyResponse.status).toBe(201);

    const moveResponse = await worker.fetch(
      new Request(origin + "/notes/docs/file-copy.txt", {
        method: "MOVE",
        headers: {
          Destination: origin + "/notes/docs/file-moved.txt",
        },
      }),
      env,
    );
    expect([201, 204]).toContain(moveResponse.status);

    const getResponse = await worker.fetch(new Request(origin + "/notes/docs/file-moved.txt"), env);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe("hello world");

    const deleteResponse = await worker.fetch(
      new Request(origin + "/notes/docs/file-moved.txt", { method: "DELETE" }),
      env,
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("enforces per-app basic auth and supports admin login/password rotation", async () => {
    const env = createEnv();
    const origin = "https://example.com";

    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);
    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Secure Notes",
      slug: "secure",
      rootPrefix: "secure/",
      authUsername: "alice",
      authPassword: "secret-pass",
    });

    const anonymousResponse = await worker.fetch(new Request(origin + "/secure/"), env);
    expect(anonymousResponse.status).toBe(401);

    const authedResponse = await worker.fetch(
      new Request(origin + "/secure/", {
        headers: {
          Authorization: "Basic " + btoa("alice:secret-pass"),
        },
      }),
      env,
    );
    expect(authedResponse.status).toBe(200);
    expect(await authedResponse.text()).toContain("WebDAV ready");

    const rotateResponse = await worker.fetch(
      new Request(origin + "/manage/api/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          currentPassword: "admin-pass",
          newPassword: "next-pass",
        }),
      }),
      env,
    );
    expect(rotateResponse.status).toBe(200);
    const rotatedSessionCookie = extractSessionCookie(rotateResponse);

    const staleSessionResponse = await worker.fetch(
      new Request(origin + "/manage/api/apps", {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      env,
    );
    expect(staleSessionResponse.status).toBe(401);

    const rotatedCsrfToken = await extractCsrfToken(env, origin, rotatedSessionCookie);

    const logoutResponse = await worker.fetch(
      new Request(origin + "/manage/api/logout", {
        method: "POST",
        headers: {
          "X-CSRF-Token": rotatedCsrfToken,
          Cookie: rotatedSessionCookie,
        },
      }),
      env,
    );
    expect(logoutResponse.status).toBe(200);

    const failedLogin = await worker.fetch(
      new Request(origin + "/manage/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "admin-pass" }),
      }),
      env,
    );
    expect(failedLogin.status).toBe(401);

    const nextLogin = await worker.fetch(
      new Request(origin + "/manage/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "next-pass" }),
      }),
      env,
    );
    expect(nextLogin.status).toBe(200);
  });

  it("migrates legacy admin hashes and rate limits repeated failed logins", async () => {
    const env = createEnv();
    const origin = "https://example.com";

    await env.WEBDAV_CONFIG.put(
      ADMIN_CONFIG_KEY,
      JSON.stringify({
        passwordHash: await sha256Hex("legacy-pass"),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const migratedLogin = await worker.fetch(
      new Request(origin + "/manage/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "legacy-pass" }),
      }),
      env,
    );
    expect(migratedLogin.status).toBe(200);

    const adminConfig = await env.WEBDAV_CONFIG.get<{ passwordHash: string }>(ADMIN_CONFIG_KEY, "json");
    expect(adminConfig?.passwordHash).toMatch(/^pbkdf2_sha256\$/);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failedLogin = await worker.fetch(
        new Request(origin + "/manage/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "198.51.100.10",
          },
          body: JSON.stringify({ password: "wrong-pass" }),
        }),
        env,
      );
      expect(failedLogin.status).toBe(attempt === 5 ? 429 : 401);
    }

    const blockedLogin = await worker.fetch(
      new Request(origin + "/manage/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.10",
        },
        body: JSON.stringify({ password: "legacy-pass" }),
      }),
      env,
    );
    expect(blockedLogin.status).toBe(429);

    const otherClientLogin = await worker.fetch(
      new Request(origin + "/manage/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.11",
        },
        body: JSON.stringify({ password: "legacy-pass" }),
      }),
      env,
    );
    expect(otherClientLogin.status).toBe(200);
  });

  it("migrates legacy app auth hashes after a successful request", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const record: AppRecord = {
      id: "legacy-app",
      name: "Legacy Secure Notes",
      slug: "legacy-secure",
      rootPrefix: "legacy-secure/",
      notes: "",
      authUsername: "alice",
      passwordHash: await sha256Hex("secret-pass"),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await saveApp(env, record);

    const response = await worker.fetch(
      new Request(origin + "/legacy-secure/", {
        headers: {
          Authorization: "Basic " + btoa("alice:secret-pass"),
        },
      }),
      env,
    );
    expect(response.status).toBe(200);

    const migratedRecord = await getAppById(env, record.id);
    expect(migratedRecord?.passwordHash).toMatch(/^pbkdf2_sha256\$/);
  });

  it("supports LOCK, MOVE with lock tokens, and UNLOCK", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Locked Notes",
      slug: "locked",
      rootPrefix: "locked/",
    });

    const mkcolResponse = await worker.fetch(new Request(origin + "/locked/docs/", { method: "MKCOL" }), env);
    expect(mkcolResponse.status).toBe(201);

    const putResponse = await worker.fetch(
      new Request(origin + "/locked/docs/file.txt", {
        method: "PUT",
        body: "draft",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(putResponse.status).toBe(201);

    const lockResponse = await worker.fetch(
      new Request(origin + "/locked/docs/file.txt", {
        method: "LOCK",
        headers: {
          "Content-Type": 'application/xml; charset="utf-8"',
          Timeout: "Second-600",
        },
        body: EXCLUSIVE_LOCK_BODY,
      }),
      env,
    );
    expect(lockResponse.status).toBe(200);
    expect(await lockResponse.text()).toContain("lockdiscovery");
    const lockToken = extractLockToken(lockResponse);

    const blockedPut = await worker.fetch(
      new Request(origin + "/locked/docs/file.txt", {
        method: "PUT",
        body: "updated",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(blockedPut.status).toBe(423);

    const unlockedPut = await worker.fetch(
      new Request(origin + "/locked/docs/file.txt", {
        method: "PUT",
        body: "updated",
        headers: {
          "Content-Type": "text/plain",
          If: `(${lockToken})`,
        },
      }),
      env,
    );
    expect(unlockedPut.status).toBe(204);

    const moveResponse = await worker.fetch(
      new Request(origin + "/locked/docs/file.txt", {
        method: "MOVE",
        headers: {
          Destination: origin + "/locked/docs/file-renamed.txt",
          If: `(${lockToken})`,
        },
      }),
      env,
    );
    expect([201, 204]).toContain(moveResponse.status);

    const blockedMovedPut = await worker.fetch(
      new Request(origin + "/locked/docs/file-renamed.txt", {
        method: "PUT",
        body: "blocked",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(blockedMovedPut.status).toBe(423);

    const propfindResponse = await worker.fetch(
      new Request(origin + "/locked/docs/file-renamed.txt", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      }),
      env,
    );
    expect(propfindResponse.status).toBe(207);
    const propfindBody = await propfindResponse.text();
    expect(propfindBody).toContain("supportedlock");
    expect(propfindBody).toContain(lockToken.replace(/^<|>$/g, ""));

    const unlockResponse = await worker.fetch(
      new Request(origin + "/locked/docs/file-renamed.txt", {
        method: "UNLOCK",
        headers: {
          "Lock-Token": lockToken,
        },
      }),
      env,
    );
    expect(unlockResponse.status).toBe(204);

    const finalPut = await worker.fetch(
      new Request(origin + "/locked/docs/file-renamed.txt", {
        method: "PUT",
        body: "final",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(finalPut.status).toBe(204);
  });

  it("applies depth-infinity collection locks to descendants", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Team Space",
      slug: "team-space",
      rootPrefix: "team-space/",
    });

    const mkcolResponse = await worker.fetch(new Request(origin + "/team-space/projects/", { method: "MKCOL" }), env);
    expect(mkcolResponse.status).toBe(201);

    const lockResponse = await worker.fetch(
      new Request(origin + "/team-space/projects/", {
        method: "LOCK",
        headers: {
          "Content-Type": 'application/xml; charset="utf-8"',
          Depth: "infinity",
        },
        body: EXCLUSIVE_LOCK_BODY,
      }),
      env,
    );
    expect(lockResponse.status).toBe(200);
    const lockToken = extractLockToken(lockResponse);

    const blockedChildPut = await worker.fetch(
      new Request(origin + "/team-space/projects/spec.md", {
        method: "PUT",
        body: "spec",
        headers: { "Content-Type": "text/markdown" },
      }),
      env,
    );
    expect(blockedChildPut.status).toBe(423);

    const allowedChildPut = await worker.fetch(
      new Request(origin + "/team-space/projects/spec.md", {
        method: "PUT",
        body: "spec",
        headers: {
          "Content-Type": "text/markdown",
          If: `(${lockToken})`,
        },
      }),
      env,
    );
    expect(allowedChildPut.status).toBe(201);

    const childPropfind = await worker.fetch(
      new Request(origin + "/team-space/projects/spec.md", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      }),
      env,
    );
    expect(childPropfind.status).toBe(207);
    expect(await childPropfind.text()).toContain(lockToken.replace(/^<|>$/g, ""));

    const blockedChildDelete = await worker.fetch(
      new Request(origin + "/team-space/projects/spec.md", {
        method: "DELETE",
      }),
      env,
    );
    expect(blockedChildDelete.status).toBe(423);

    const unlockResponse = await worker.fetch(
      new Request(origin + "/team-space/projects/", {
        method: "UNLOCK",
        headers: {
          "Lock-Token": lockToken,
        },
      }),
      env,
    );
    expect(unlockResponse.status).toBe(204);

    const deleteResponse = await worker.fetch(
      new Request(origin + "/team-space/projects/spec.md", {
        method: "DELETE",
      }),
      env,
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("supports PROPFIND depth variants and preserves GET/HEAD metadata", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Reference Notes",
      slug: "reference",
      rootPrefix: "reference/",
    });

    expect(await worker.fetch(new Request(origin + "/reference/docs/", { method: "MKCOL" }), env).then((response) => response.status)).toBe(201);
    expect(
      await worker.fetch(new Request(origin + "/reference/docs/archive/", { method: "MKCOL" }), env).then((response) => response.status),
    ).toBe(201);

    const readmeBody = "# hello\n";
    const putReadme = await worker.fetch(
      new Request(origin + "/reference/docs/readme.md", {
        method: "PUT",
        body: readmeBody,
        headers: { "Content-Type": "text/markdown" },
      }),
      env,
    );
    expect(putReadme.status).toBe(201);

    const putArchive = await worker.fetch(
      new Request(origin + "/reference/docs/archive/old.md", {
        method: "PUT",
        body: "old",
        headers: { "Content-Type": "text/markdown" },
      }),
      env,
    );
    expect(putArchive.status).toBe(201);

    const getResponse = await worker.fetch(new Request(origin + "/reference/docs/readme.md"), env);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe(readmeBody);

    const headResponse = await worker.fetch(
      new Request(origin + "/reference/docs/readme.md", {
        method: "HEAD",
      }),
      env,
    );
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("ETag")).toBe(getResponse.headers.get("ETag"));
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(headResponse.headers.get("Content-Length")).toBe(String(readmeBody.length));

    const depthZero = await worker.fetch(
      new Request(origin + "/reference/docs/", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      }),
      env,
    );
    expect(depthZero.status).toBe(207);
    const depthZeroBody = await depthZero.text();
    expect(countXmlResponses(depthZeroBody)).toBe(1);

    const depthOne = await worker.fetch(
      new Request(origin + "/reference/docs/", {
        method: "PROPFIND",
        headers: { Depth: "1" },
      }),
      env,
    );
    expect(depthOne.status).toBe(207);
    const depthOneBody = await depthOne.text();
    expect(countXmlResponses(depthOneBody)).toBe(3);
    expect(depthOneBody).toContain("/reference/docs/archive/");
    expect(depthOneBody).toContain("/reference/docs/readme.md");
    expect(depthOneBody).not.toContain("/reference/docs/archive/old.md");

    const depthInfinity = await worker.fetch(
      new Request(origin + "/reference/docs/", {
        method: "PROPFIND",
        headers: { Depth: "infinity" },
      }),
      env,
    );
    expect(depthInfinity.status).toBe(207);
    const depthInfinityBody = await depthInfinity.text();
    expect(countXmlResponses(depthInfinityBody)).toBe(4);
    expect(depthInfinityBody).toContain("/reference/docs/archive/old.md");

    const invalidDepth = await worker.fetch(
      new Request(origin + "/reference/docs/", {
        method: "PROPFIND",
        headers: { Depth: "banana" },
      }),
      env,
    );
    expect(invalidDepth.status).toBe(400);
  });

  it("enforces overwrite and destination parent checks for copy and move", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Moves",
      slug: "moves",
      rootPrefix: "moves/",
    });

    expect(await worker.fetch(new Request(origin + "/moves/docs/", { method: "MKCOL" }), env).then((response) => response.status)).toBe(201);
    expect(
      await worker.fetch(
        new Request(origin + "/moves/docs/file.txt", {
          method: "PUT",
          body: "file",
          headers: { "Content-Type": "text/plain" },
        }),
        env,
      ).then((response) => response.status),
    ).toBe(201);
    expect(
      await worker.fetch(
        new Request(origin + "/moves/docs/existing.txt", {
          method: "PUT",
          body: "existing",
          headers: { "Content-Type": "text/plain" },
        }),
        env,
      ).then((response) => response.status),
    ).toBe(201);

    const blockedCopy = await worker.fetch(
      new Request(origin + "/moves/docs/file.txt", {
        method: "COPY",
        headers: {
          Destination: origin + "/moves/docs/existing.txt",
          Overwrite: "F",
        },
      }),
      env,
    );
    expect(blockedCopy.status).toBe(412);

    const blockedCopyParent = await worker.fetch(
      new Request(origin + "/moves/docs/file.txt", {
        method: "COPY",
        headers: {
          Destination: origin + "/moves/missing/file.txt",
        },
      }),
      env,
    );
    expect(blockedCopyParent.status).toBe(409);

    const blockedMoveParent = await worker.fetch(
      new Request(origin + "/moves/docs/file.txt", {
        method: "MOVE",
        headers: {
          Destination: origin + "/moves/missing/file.txt",
        },
      }),
      env,
    );
    expect(blockedMoveParent.status).toBe(409);
  });

  it("blocks recursive deletes for locked descendants and keeps descendant locks on move", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Locked Tree",
      slug: "locked-tree",
      rootPrefix: "locked-tree/",
    });

    expect(await worker.fetch(new Request(origin + "/locked-tree/docs/", { method: "MKCOL" }), env).then((response) => response.status)).toBe(201);
    expect(await worker.fetch(new Request(origin + "/locked-tree/docs/sub/", { method: "MKCOL" }), env).then((response) => response.status)).toBe(201);
    expect(
      await worker.fetch(
        new Request(origin + "/locked-tree/docs/sub/file.txt", {
          method: "PUT",
          body: "draft",
          headers: { "Content-Type": "text/plain" },
        }),
        env,
      ).then((response) => response.status),
    ).toBe(201);

    const lockResponse = await worker.fetch(
      new Request(origin + "/locked-tree/docs/sub/file.txt", {
        method: "LOCK",
        headers: {
          "Content-Type": 'application/xml; charset="utf-8"',
          Timeout: "Second-600",
        },
        body: EXCLUSIVE_LOCK_BODY,
      }),
      env,
    );
    expect(lockResponse.status).toBe(200);
    const lockToken = extractLockToken(lockResponse);

    const blockedDelete = await worker.fetch(
      new Request(origin + "/locked-tree/docs/", {
        method: "DELETE",
      }),
      env,
    );
    expect(blockedDelete.status).toBe(423);

    const blockedMove = await worker.fetch(
      new Request(origin + "/locked-tree/docs/", {
        method: "MOVE",
        headers: {
          Destination: origin + "/locked-tree/docs-renamed/",
        },
      }),
      env,
    );
    expect(blockedMove.status).toBe(423);

    const movedCollection = await worker.fetch(
      new Request(origin + "/locked-tree/docs/", {
        method: "MOVE",
        headers: {
          Destination: origin + "/locked-tree/docs-renamed/",
          If: `(${lockToken})`,
        },
      }),
      env,
    );
    expect([201, 204]).toContain(movedCollection.status);

    const blockedPut = await worker.fetch(
      new Request(origin + "/locked-tree/docs-renamed/sub/file.txt", {
        method: "PUT",
        body: "updated",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(blockedPut.status).toBe(423);

    const movedPropfind = await worker.fetch(
      new Request(origin + "/locked-tree/docs-renamed/sub/file.txt", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      }),
      env,
    );
    expect(movedPropfind.status).toBe(207);
    expect(await movedPropfind.text()).toContain(lockToken.replace(/^<|>$/g, ""));

    const unlockResponse = await worker.fetch(
      new Request(origin + "/locked-tree/docs-renamed/sub/file.txt", {
        method: "UNLOCK",
        headers: {
          "Lock-Token": lockToken,
        },
      }),
      env,
    );
    expect(unlockResponse.status).toBe(204);

    const deleteResponse = await worker.fetch(
      new Request(origin + "/locked-tree/docs-renamed/", {
        method: "DELETE",
      }),
      env,
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("does not copy lock state to copied resources", async () => {
    const env = createEnv();
    const origin = "https://example.com";
    const { sessionCookie, csrfToken } = await bootstrapAdmin(env, origin);

    await createApp(env, origin, sessionCookie, csrfToken, {
      name: "Copies",
      slug: "copies",
      rootPrefix: "copies/",
    });

    expect(await worker.fetch(new Request(origin + "/copies/file.txt", {
      method: "PUT",
      body: "draft",
      headers: { "Content-Type": "text/plain" },
    }), env).then((response) => response.status)).toBe(201);

    const lockResponse = await worker.fetch(
      new Request(origin + "/copies/file.txt", {
        method: "LOCK",
        headers: {
          "Content-Type": 'application/xml; charset="utf-8"',
        },
        body: EXCLUSIVE_LOCK_BODY,
      }),
      env,
    );
    expect(lockResponse.status).toBe(200);
    const lockToken = extractLockToken(lockResponse);

    const copyResponse = await worker.fetch(
      new Request(origin + "/copies/file.txt", {
        method: "COPY",
        headers: {
          Destination: origin + "/copies/file-copy.txt",
        },
      }),
      env,
    );
    expect(copyResponse.status).toBe(201);

    const copiedPropfind = await worker.fetch(
      new Request(origin + "/copies/file-copy.txt", {
        method: "PROPFIND",
        headers: { Depth: "0" },
      }),
      env,
    );
    expect(copiedPropfind.status).toBe(207);
    expect(await copiedPropfind.text()).not.toContain(lockToken.replace(/^<|>$/g, ""));

    const copiedPut = await worker.fetch(
      new Request(origin + "/copies/file-copy.txt", {
        method: "PUT",
        body: "copied-update",
        headers: { "Content-Type": "text/plain" },
      }),
      env,
    );
    expect(copiedPut.status).toBe(204);
  });
});
