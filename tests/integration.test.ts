import { describe, expect, it } from "vitest";

import worker from "../src/index";
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
  const adminPage = await worker.fetch(
    new Request(origin + "/manage", {
      headers: { Cookie: sessionCookie },
    }),
    env,
  );

  return {
    sessionCookie,
    csrfToken: extractCsrfToken(await adminPage.text()),
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

describe("worker integration", () => {
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

    const logoutResponse = await worker.fetch(
      new Request(origin + "/manage/api/logout", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
          Cookie: sessionCookie,
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
});
