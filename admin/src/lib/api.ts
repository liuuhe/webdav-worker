import type { ApiErrorPayload, AppFormValues, DeleteAppOptions, PublicApp, SessionState } from "@/lib/types"

const API_BASE = "/manage/api"

export class ApiError extends Error {
  readonly status: number
  readonly errorCode: string
  readonly requestId: string

  constructor(
    message: string,
    status: number,
    errorCode: string,
    requestId: string,
  ) {
    super(message)
    this.status = status
    this.errorCode = errorCode
    this.requestId = requestId
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; requestId: string }> {
  const response = await fetch(`${API_BASE}${path}`, init)
  const requestId = response.headers.get("X-Request-Id") ?? ""
  const contentType = response.headers.get("Content-Type") ?? ""
  const body = contentType.includes("application/json")
    ? ((await response.json()) as T | ApiErrorPayload)
    : null

  if (!response.ok) {
    const payload = (body ?? {}) as ApiErrorPayload
    throw new ApiError(payload.error ?? "Request failed.", response.status, payload.errorCode ?? "request_failed", requestId)
  }

  return {
    data: (body ?? {}) as T,
    requestId,
  }
}

function jsonHeaders(csrfToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  }
}

function appPayload(values: AppFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    rootPrefix: values.rootPrefix,
    notes: values.notes,
    authUsername: values.authEnabled ? values.authUsername : "",
    authPassword: values.authEnabled ? values.authPassword : "",
  }
}

export async function getSessionState() {
  return request<SessionState>("/session")
}

export async function setupAdmin(bootstrapToken: string, newPassword: string) {
  return request<{ ok: true }>("/setup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ bootstrapToken, newPassword }),
  })
}

export async function loginAdmin(password: string) {
  return request<{ ok: true }>("/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ password }),
  })
}

export async function logoutAdmin(csrfToken: string) {
  return request<{ ok: true }>("/logout", {
    method: "POST",
    headers: jsonHeaders(csrfToken),
  })
}

export async function changeAdminPassword(currentPassword: string, newPassword: string, csrfToken: string) {
  return request<{ ok: true }>("/password", {
    method: "POST",
    headers: jsonHeaders(csrfToken),
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function listApps() {
  return request<{ apps: PublicApp[] }>("/apps")
}

export async function getApp(appId: string) {
  return request<{ app: PublicApp }>(`/apps/${encodeURIComponent(appId)}`)
}

export async function createApp(values: AppFormValues, csrfToken: string) {
  return request<{ app: PublicApp; createdUrl: string }>("/apps", {
    method: "POST",
    headers: jsonHeaders(csrfToken),
    body: JSON.stringify(appPayload(values)),
  })
}

export async function updateApp(appId: string, values: AppFormValues, csrfToken: string) {
  return request<{ app: PublicApp }>(`/apps/${encodeURIComponent(appId)}`, {
    method: "PUT",
    headers: jsonHeaders(csrfToken),
    body: JSON.stringify(appPayload(values)),
  })
}

export async function deleteApp(appId: string, options: DeleteAppOptions, csrfToken: string) {
  return request<{ ok: true }>(`/apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
    headers: jsonHeaders(csrfToken),
    body: JSON.stringify(options),
  })
}
