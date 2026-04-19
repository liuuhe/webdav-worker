import type { AdminErrorCode } from "./types";

export function jsonResponse(payload: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    }),
  });
}

export function adminErrorResponse(code: AdminErrorCode, status: number, extraHeaders: HeadersInit = {}): Response {
  return jsonResponse(
    {
      error: adminErrorMessage(code),
      errorCode: code,
    },
    status,
    extraHeaders,
  );
}

export function adminErrorMessage(code: AdminErrorCode): string {
  switch (code) {
    case "invalid_json":
      return "The request body must be valid JSON.";
    case "internal_error":
      return "Internal server error.";
    case "app_not_found":
      return "App not found.";
    case "path_in_use":
      return "This app path is already in use.";
    case "storage_prefix_in_use":
      return "This storage path is already used by another app.";
    case "name_required":
      return "Name is required.";
    case "name_too_long":
      return "Name is too long.";
    case "storage_prefix_required":
      return "Storage path is required.";
    case "storage_prefix_invalid":
      return "Storage path may only contain letters, numbers, dots, underscores, hyphens, and forward slashes.";
    case "notes_invalid":
      return "Notes must be a string.";
    case "path_required":
      return "App path is required.";
    case "path_invalid":
      return "App path may only contain letters, numbers, and hyphens.";
    case "path_reserved":
      return "This app path is reserved.";
    case "username_invalid":
      return "Username must be a string.";
    case "username_format_invalid":
      return "Username cannot contain whitespace or a colon, and must be 64 characters or fewer.";
    case "password_invalid":
      return "Password must be a string.";
    case "username_required_for_password":
      return "A username is required when a password is set.";
    case "password_required_for_auth":
      return "A password is required the first time you enable auth.";
    case "password_empty":
      return "Password cannot be empty.";
    case "invalid_credentials":
      return "Invalid admin password.";
    case "setup_required":
      return "Admin setup is required before login.";
    case "already_configured":
      return "Admin access is already configured.";
    case "current_password_invalid":
      return "Current admin password is incorrect.";
    case "new_password_required":
      return "A new admin password is required.";
    case "bootstrap_token_invalid":
      return "The bootstrap token is invalid.";
    case "too_many_attempts":
      return "Too many failed login attempts. Try again later.";
    case "admin_session_required":
      return "Admin authentication is required.";
    case "csrf_invalid":
      return "The CSRF token is invalid.";
  }

  return "Unknown admin error.";
}

export function adminMethodNotAllowed(): Response {
  return new Response("Method not allowed.", {
    status: 405,
    headers: new Headers({
      Allow: "GET, POST, PUT, DELETE",
    }),
  });
}

export function redirectResponse(location: string, status = 302, extraHeaders: HeadersInit = {}): Response {
  return new Response(null, {
    status,
    headers: new Headers({
      Location: location,
      ...extraHeaders,
    }),
  });
}
