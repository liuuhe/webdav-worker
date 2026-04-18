import { describe, expect, it } from "vitest";

import worker from "../src/index";
import { createEnv, extractCsrfToken, extractSessionCookie } from "./mocks";

describe("worker integration", () => {
  it("supports admin setup, app creation, and WebDAV CRUD/COPY/MOVE", async () => {
    const env = createEnv();
    const origin = "https://example.com";

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
    const csrfToken = extractCsrfToken(await adminPage.text());

    const createResponse = await worker.fetch(
      new Request(origin + "/manage/api/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Notes",
          slug: "notes",
          rootPrefix: "notes/",
          notes: "Demo",
        }),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);

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
    const sessionCookie = extractSessionCookie(setupResponse);
    const adminPage = await worker.fetch(
      new Request(origin + "/manage", {
        headers: { Cookie: sessionCookie },
      }),
      env,
    );
    const csrfToken = extractCsrfToken(await adminPage.text());

    const createResponse = await worker.fetch(
      new Request(origin + "/manage/api/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Secure Notes",
          slug: "secure",
          rootPrefix: "secure/",
          authUsername: "alice",
          authPassword: "secret-pass",
        }),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);

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
});
