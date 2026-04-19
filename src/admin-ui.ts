import type { AdminPageState } from "./types";

export function renderAdminPage(origin: string, state: AdminPageState): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WebDAV Admin</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --panel: rgba(255, 255, 255, 0.94);
      --panel-strong: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --primary: #111827;
      --primary-contrast: #f8fafc;
      --danger: #dc2626;
      --success: #166534;
      --radius: 18px;
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 48px rgba(15, 23, 42, 0.08);
      --font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      --mono: ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(148, 163, 184, 0.2), transparent 28%),
        linear-gradient(180deg, #f8fafc 0%, #f3f5f9 100%);
      color: var(--text);
      font-family: var(--font);
    }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    .hidden { display: none !important; }
    .shell {
      width: min(1180px, calc(100vw - 28px));
      margin: 28px auto 56px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .eyebrow {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .title {
      margin: 8px 0 0;
      font-size: clamp(28px, 4vw, 38px);
      font-weight: 700;
      letter-spacing: -0.04em;
    }
    .sub {
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
      max-width: 560px;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .lang-switch {
      display: inline-flex;
      padding: 4px;
      border: 1px solid rgba(226, 232, 240, 0.92);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .lang-button {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .lang-button.active {
      background: var(--primary);
      color: var(--primary-contrast);
    }
    .badge {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--muted);
      font-size: 12px;
      font-family: var(--mono);
      background: rgba(255, 255, 255, 0.9);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
      gap: 18px;
    }
    .auth-shell {
      display: grid;
      place-items: center;
      min-height: calc(100vh - 180px);
    }
    .auth-card {
      width: min(460px, 100%);
    }
    .stack { display: grid; gap: 14px; }
    .stack.compact { gap: 12px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
      padding: 20px;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }
    .card-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .card-subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.06);
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    label {
      display: block;
      margin-bottom: 7px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 11px 13px;
      color: var(--text);
      background: var(--panel-strong);
      outline: none;
      transition: border-color 0.16s ease, box-shadow 0.16s ease;
    }
    input:focus, textarea:focus {
      border-color: #94a3b8;
      box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
    }
    textarea {
      min-height: 88px;
      resize: vertical;
    }
    .actions, .item-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      appearance: none;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 12px;
      transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }
    button:hover { transform: translateY(-1px); }
    button.primary {
      background: var(--primary);
      color: var(--primary-contrast);
      border-color: var(--primary);
    }
    button.danger {
      color: var(--danger);
      border-color: #fecaca;
      background: #fff5f5;
    }
    .ghost { background: rgba(255, 255, 255, 0.72); }
    .status, .result {
      display: none;
      margin-top: 16px;
      border-radius: 14px;
      padding: 12px;
      font-size: 14px;
      line-height: 1.5;
    }
    .status.show, .result.show { display: block; }
    .status {
      background: #f8fafc;
      border: 1px solid var(--line);
    }
    .status.error {
      color: var(--danger);
      background: #fff5f5;
      border-color: #fecaca;
    }
    .result {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
    }
    .result strong {
      display: block;
      margin-bottom: 8px;
    }
    .result code, .mono {
      font-family: var(--mono);
      word-break: break-all;
    }
    .subgrid {
      display: grid;
      gap: 16px;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .toolbar h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .toolbar-meta {
      color: var(--muted);
      font-size: 13px;
    }
    .list {
      display: grid;
      gap: 12px;
    }
    .item {
      border: 1px solid rgba(226, 232, 240, 0.92);
      border-radius: 16px;
      padding: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .item-title {
      font-size: 16px;
      font-weight: 600;
    }
    .item-time {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .meta {
      display: grid;
      grid-template-columns: 94px minmax(0, 1fr);
      gap: 8px 12px;
      font-size: 14px;
      margin-bottom: 12px;
    }
    .meta div:nth-child(odd) { color: var(--muted); }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 16px;
      padding: 34px 18px;
      color: var(--muted);
      text-align: center;
      background: #fbfdff;
    }
    @media (max-width: 900px) {
      .shell { width: min(100vw - 16px, 1180px); margin-top: 16px; }
      .topbar { align-items: stretch; flex-direction: column; }
      .top-actions { justify-content: flex-start; }
      .layout { grid-template-columns: 1fr; }
      .meta { grid-template-columns: 80px minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div>
        <div class="eyebrow">Cloudflare Workers</div>
        <div class="title" data-i18n="pageTitle"></div>
        <div class="sub" data-i18n="pageSubtitle"></div>
      </div>
      <div class="top-actions">
        <div class="lang-switch" aria-label="Language">
          <button type="button" class="lang-button" data-lang="en">EN</button>
          <button type="button" class="lang-button" data-lang="zh">中文</button>
        </div>
        <div class="badge">${origin}${state.accessPath}</div>
      </div>
    </div>

    <div id="auth-shell" class="auth-shell">
      <section class="card auth-card">
        <div class="card-head">
          <div>
            <div class="card-title" id="auth-title"></div>
            <div class="card-subtitle" id="auth-subtitle"></div>
          </div>
          <div class="pill" id="auth-pill"></div>
        </div>

        <form id="auth-form" class="stack compact">
          <div id="bootstrap-group">
            <label for="bootstrap-token" data-i18n="bootstrapTokenLabel"></label>
            <input id="bootstrap-token" type="password" data-i18n-placeholder="bootstrapTokenPlaceholder" />
          </div>
          <div id="login-password-group">
            <label for="login-password" data-i18n="adminPasswordLabel"></label>
            <input id="login-password" type="password" data-i18n-placeholder="adminPasswordPlaceholder" />
          </div>
          <div id="new-password-group">
            <label for="new-password" data-i18n="newPasswordLabel"></label>
            <input id="new-password" type="password" data-i18n-placeholder="newPasswordPlaceholder" />
          </div>
          <div id="confirm-password-group">
            <label for="confirm-password" data-i18n="confirmPasswordLabel"></label>
            <input id="confirm-password" type="password" data-i18n-placeholder="confirmPasswordPlaceholder" />
          </div>
          <div class="actions">
            <button class="primary" type="submit" id="auth-submit"></button>
          </div>
        </form>
        <div class="status" id="auth-status"></div>
      </section>
    </div>

    <div id="admin-shell" class="layout hidden">
      <div class="subgrid">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title" id="form-title"></div>
              <div class="card-subtitle" data-i18n="formSubtitle"></div>
            </div>
            <div class="pill" data-i18n="pathModelPill"></div>
          </div>
          <form id="app-form" class="stack">
            <input type="hidden" id="app-id" />
            <div>
              <label for="name" data-i18n="nameLabel"></label>
              <input id="name" data-i18n-placeholder="namePlaceholder" />
            </div>
            <div>
              <label for="slug" data-i18n="pathLabel"></label>
              <input id="slug" data-i18n-placeholder="pathPlaceholder" />
            </div>
            <div>
              <label for="rootPrefix" data-i18n="storageLabel"></label>
              <input id="rootPrefix" data-i18n-placeholder="storagePlaceholder" />
            </div>
            <div>
              <label for="notes" data-i18n="notesLabel"></label>
              <textarea id="notes" data-i18n-placeholder="notesPlaceholder"></textarea>
            </div>
            <div>
              <label for="authUsername" data-i18n="authUsernameLabel"></label>
              <input id="authUsername" data-i18n-placeholder="authUsernamePlaceholder" />
            </div>
            <div>
              <label for="authPassword" data-i18n="authPasswordLabel"></label>
              <input id="authPassword" type="password" data-i18n-placeholder="authPasswordPlaceholder" />
            </div>
            <div class="actions">
              <button class="primary" type="submit" id="submit-button"></button>
              <button type="button" class="ghost" id="reset-button" data-i18n="resetButton"></button>
            </div>
          </form>
          <div class="status" id="status"></div>
          <div class="result" id="result">
            <strong data-i18n="accessUrlLabel"></strong>
            <code id="result-url"></code>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title" data-i18n="securityTitle"></div>
              <div class="card-subtitle" data-i18n="securitySubtitle"></div>
            </div>
          </div>
          <form id="password-form" class="stack compact">
            <div>
              <label for="current-admin-password" data-i18n="currentPasswordLabel"></label>
              <input id="current-admin-password" type="password" data-i18n-placeholder="currentPasswordPlaceholder" />
            </div>
            <div>
              <label for="next-admin-password" data-i18n="newPasswordLabel"></label>
              <input id="next-admin-password" type="password" data-i18n-placeholder="newPasswordPlaceholder" />
            </div>
            <div>
              <label for="confirm-admin-password" data-i18n="confirmPasswordLabel"></label>
              <input id="confirm-admin-password" type="password" data-i18n-placeholder="confirmPasswordPlaceholder" />
            </div>
            <div class="actions">
              <button class="primary" type="submit" id="password-submit" data-i18n="updatePasswordButton"></button>
              <button type="button" class="ghost" id="logout-button" data-i18n="logoutButton"></button>
            </div>
          </form>
          <div class="status" id="password-status"></div>
        </section>
      </div>

      <section class="card">
        <div class="toolbar">
          <div>
            <h2 data-i18n="listTitle"></h2>
            <div class="toolbar-meta" id="list-meta"></div>
          </div>
          <button type="button" class="ghost" id="refresh-button" data-i18n="refreshButton"></button>
        </div>
        <div id="list" class="list"></div>
      </section>
    </div>
  </div>

  <template id="item-template">
    <article class="item">
      <div class="item-head">
        <div class="item-title" data-name></div>
        <div class="item-time" data-time></div>
      </div>
      <div class="meta">
        <div data-i18n="pathMetaLabel"></div><div class="mono" data-slug></div>
        <div data-i18n="urlMetaLabel"></div><div class="mono" data-url></div>
        <div data-i18n="storageMetaLabel"></div><div class="mono" data-root></div>
        <div data-i18n="authMetaLabel"></div><div data-auth></div>
        <div data-i18n="notesMetaLabel"></div><div data-notes></div>
      </div>
      <div class="item-actions">
        <button type="button" data-edit data-i18n="editButton"></button>
        <button type="button" data-copy data-i18n="copyButton"></button>
        <button type="button" class="danger" data-delete data-i18n="deleteButton"></button>
      </div>
    </article>
  </template>

  <script>
    const initialState = ${JSON.stringify(state)};
    const storageKey = "webdav-admin-language";
    const translations = {
      en: {
        pageTitle: "WebDAV Admin",
        pageSubtitle: "Manage fixed WebDAV paths for each app from one clean panel.",
        formSubtitle: "Each app maps to its own storage prefix.",
        pathModelPill: "Path-based access",
        newApp: "New app",
        editApp: "Edit app",
        nameLabel: "Name",
        namePlaceholder: "For example: Obsidian Notes",
        pathLabel: "Path",
        pathPlaceholder: "For example: obsidian-notes",
        storageLabel: "Storage path",
        storagePlaceholder: "For example: obsidian/work/",
        notesLabel: "Notes",
        notesPlaceholder: "Optional",
        authUsernameLabel: "WebDAV username",
        authUsernamePlaceholder: "Leave blank to disable auth",
        authPasswordLabel: "WebDAV password",
        authPasswordPlaceholder: "Leave blank on edit to keep the current password",
        saveButton: "Save",
        resetButton: "Reset",
        accessUrlLabel: "Access URL",
        listTitle: "Apps",
        listMeta: "{count} app(s)",
        refreshButton: "Refresh",
        pathMetaLabel: "Path",
        urlMetaLabel: "URL",
        storageMetaLabel: "Storage",
        authMetaLabel: "Auth",
        notesMetaLabel: "Notes",
        editButton: "Edit",
        copyButton: "Copy URL",
        deleteButton: "Delete",
        emptyState: "No apps yet.",
        authEnabledWithUser: "Enabled / {username}",
        authDisabled: "Disabled",
        notesEmpty: "None",
        copied: "URL copied.",
        copyFailed: "Unable to copy the URL.",
        deleteConfirm: "Select OK to delete the app and purge its stored files. Select Cancel to delete the app record only.",
        deleteFailed: "Failed to delete the app.",
        deleted: "App deleted.",
        deletedPurged: "App deleted and storage cleared.",
        loadFailed: "Failed to load apps.",
        saveFailed: "Failed to save the app.",
        saved: "App saved.",
        created: "App created.",
        refreshed: "List refreshed.",
        refreshFailed: "Failed to refresh the list.",
        initFailed: "Failed to initialize the admin panel.",
        authLoginTitle: "Admin login",
        authLoginSubtitle: "Sign in with the admin password to manage apps and settings.",
        authSetupTitle: "Admin setup",
        authSetupSubtitle: "Use the bootstrap token once to set the permanent admin password.",
        authLoginButton: "Sign in",
        authSetupButton: "Set admin password",
        authLoginPill: "Session login",
        authSetupPill: "Bootstrap setup",
        bootstrapTokenLabel: "Bootstrap token",
        bootstrapTokenPlaceholder: "Enter ADMIN_TOKEN",
        adminPasswordLabel: "Admin password",
        adminPasswordPlaceholder: "Enter the admin password",
        newPasswordLabel: "New password",
        newPasswordPlaceholder: "Enter a new password",
        confirmPasswordLabel: "Confirm password",
        confirmPasswordPlaceholder: "Re-enter the password",
        passwordMismatch: "The passwords do not match.",
        securityTitle: "Security",
        securitySubtitle: "Rotate the admin password or end the current session.",
        currentPasswordLabel: "Current admin password",
        currentPasswordPlaceholder: "Enter the current password",
        updatePasswordButton: "Update password",
        logoutButton: "Log out",
        passwordUpdated: "Admin password updated.",
        logoutFailed: "Failed to sign out.",
        sessionExpired: "Your admin session has expired. Sign in again.",
        errors: {
          invalid_json: "The request body must be valid JSON.",
          app_not_found: "App not found.",
          path_in_use: "This app path is already in use.",
          storage_prefix_in_use: "This storage path is already used by another app.",
          name_required: "Name is required.",
          name_too_long: "Name is too long.",
          storage_prefix_required: "Storage path is required.",
          storage_prefix_invalid: "Storage path may only contain letters, numbers, dots, underscores, hyphens, and forward slashes.",
          notes_invalid: "Notes must be a string.",
          path_required: "App path is required.",
          path_invalid: "App path may only contain letters, numbers, and hyphens.",
          path_reserved: "This app path is reserved.",
          username_invalid: "Username must be a string.",
          username_format_invalid: "Username cannot contain whitespace or a colon, and must be 64 characters or fewer.",
          password_invalid: "Password must be a string.",
          username_required_for_password: "A username is required when a password is set.",
          password_required_for_auth: "A password is required the first time you enable auth.",
          password_empty: "Password cannot be empty.",
          invalid_credentials: "Invalid admin password.",
          setup_required: "Admin setup is required before login.",
          already_configured: "Admin access is already configured.",
          current_password_invalid: "Current admin password is incorrect.",
          new_password_required: "A new admin password is required.",
          bootstrap_token_invalid: "The bootstrap token is invalid.",
          too_many_attempts: "Too many failed login attempts. Try again later.",
          admin_session_required: "Admin authentication is required.",
          csrf_invalid: "The CSRF token is invalid."
        }
      },
      zh: {
        pageTitle: "WebDAV 管理",
        pageSubtitle: "在一个简洁后台里统一管理每个应用的固定 WebDAV 路径。",
        formSubtitle: "每个应用都会映射到独立的存储目录。",
        pathModelPill: "固定路径访问",
        newApp: "新建应用",
        editApp: "编辑应用",
        nameLabel: "名称",
        namePlaceholder: "例如：Obsidian 笔记",
        pathLabel: "访问路径",
        pathPlaceholder: "例如：obsidian-notes",
        storageLabel: "存储目录",
        storagePlaceholder: "例如：obsidian/work/",
        notesLabel: "备注",
        notesPlaceholder: "可留空",
        authUsernameLabel: "WebDAV 用户名",
        authUsernamePlaceholder: "留空则不启用认证",
        authPasswordLabel: "WebDAV 密码",
        authPasswordPlaceholder: "编辑时留空则保留当前密码",
        saveButton: "保存",
        resetButton: "清空",
        accessUrlLabel: "访问地址",
        listTitle: "应用列表",
        listMeta: "{count} 个应用",
        refreshButton: "刷新",
        pathMetaLabel: "路径",
        urlMetaLabel: "地址",
        storageMetaLabel: "目录",
        authMetaLabel: "认证",
        notesMetaLabel: "备注",
        editButton: "编辑",
        copyButton: "复制链接",
        deleteButton: "删除",
        emptyState: "还没有应用。",
        authEnabledWithUser: "已启用 / {username}",
        authDisabled: "未启用",
        notesEmpty: "无",
        copied: "链接已复制。",
        copyFailed: "复制链接失败。",
        deleteConfirm: "点击“确定”会同时删除目录里的数据；点击“取消”只删除这条记录。",
        deleteFailed: "删除应用失败。",
        deleted: "已删除应用。",
        deletedPurged: "已删除应用，数据也已清空。",
        loadFailed: "加载应用失败。",
        saveFailed: "保存应用失败。",
        saved: "已保存。",
        created: "已创建。",
        refreshed: "已刷新。",
        refreshFailed: "刷新列表失败。",
        initFailed: "初始化后台失败。",
        authLoginTitle: "管理员登录",
        authLoginSubtitle: "使用管理员密码登录，管理应用和后台设置。",
        authSetupTitle: "初始化后台",
        authSetupSubtitle: "使用一次性的 bootstrap token 设置正式管理员密码。",
        authLoginButton: "登录",
        authSetupButton: "设置管理员密码",
        authLoginPill: "会话登录",
        authSetupPill: "初始化配置",
        bootstrapTokenLabel: "Bootstrap Token",
        bootstrapTokenPlaceholder: "输入 ADMIN_TOKEN",
        adminPasswordLabel: "管理员密码",
        adminPasswordPlaceholder: "输入管理员密码",
        newPasswordLabel: "新密码",
        newPasswordPlaceholder: "输入新密码",
        confirmPasswordLabel: "确认密码",
        confirmPasswordPlaceholder: "再次输入密码",
        passwordMismatch: "两次输入的密码不一致。",
        securityTitle: "安全设置",
        securitySubtitle: "修改管理员密码，或结束当前会话。",
        currentPasswordLabel: "当前管理员密码",
        currentPasswordPlaceholder: "输入当前密码",
        updatePasswordButton: "更新密码",
        logoutButton: "退出登录",
        passwordUpdated: "管理员密码已更新。",
        logoutFailed: "退出登录失败。",
        sessionExpired: "管理员会话已失效，请重新登录。",
        errors: {
          invalid_json: "请求体必须是合法 JSON。",
          app_not_found: "应用不存在。",
          path_in_use: "访问路径已经被使用。",
          storage_prefix_in_use: "这个存储目录已经被别的应用使用。",
          name_required: "应用名称不能为空。",
          name_too_long: "应用名称太长了。",
          storage_prefix_required: "存储目录不能为空。",
          storage_prefix_invalid: "存储目录只能包含字母、数字、点、下划线、短横线和斜杠。",
          notes_invalid: "备注必须是字符串。",
          path_required: "访问路径不能为空。",
          path_invalid: "访问路径只能使用字母、数字和短横线。",
          path_reserved: "这个访问路径不能使用。",
          username_invalid: "用户名必须是字符串。",
          username_format_invalid: "用户名不能包含空白或冒号，且长度不能超过 64。",
          password_invalid: "密码必须是字符串。",
          username_required_for_password: "填写密码时必须同时填写用户名。",
          password_required_for_auth: "首次启用认证时必须填写密码。",
          password_empty: "密码不能为空。",
          invalid_credentials: "管理员密码不正确。",
          setup_required: "后台还没有完成初始化。",
          already_configured: "管理员访问已经配置完成。",
          current_password_invalid: "当前管理员密码不正确。",
          new_password_required: "必须填写新密码。",
          bootstrap_token_invalid: "Bootstrap Token 不正确。",
          too_many_attempts: "登录失败次数过多，请稍后再试。",
          admin_session_required: "需要先进行管理员登录。",
          csrf_invalid: "CSRF Token 无效。"
        }
      }
    };

    const state = { ...initialState };
    const apiBase = state.accessPath + "/api";
    const listEl = document.getElementById("list");
    const template = document.getElementById("item-template");
    const form = document.getElementById("app-form");
    const formTitle = document.getElementById("form-title");
    const submitButton = document.getElementById("submit-button");
    const appIdEl = document.getElementById("app-id");
    const nameEl = document.getElementById("name");
    const slugEl = document.getElementById("slug");
    const rootEl = document.getElementById("rootPrefix");
    const notesEl = document.getElementById("notes");
    const authUsernameEl = document.getElementById("authUsername");
    const authPasswordEl = document.getElementById("authPassword");
    const statusEl = document.getElementById("status");
    const resultEl = document.getElementById("result");
    const resultUrlEl = document.getElementById("result-url");
    const resetButton = document.getElementById("reset-button");
    const refreshButton = document.getElementById("refresh-button");
    const listMetaEl = document.getElementById("list-meta");
    const authShellEl = document.getElementById("auth-shell");
    const adminShellEl = document.getElementById("admin-shell");
    const authForm = document.getElementById("auth-form");
    const authTitleEl = document.getElementById("auth-title");
    const authSubtitleEl = document.getElementById("auth-subtitle");
    const authPillEl = document.getElementById("auth-pill");
    const authSubmitEl = document.getElementById("auth-submit");
    const bootstrapGroupEl = document.getElementById("bootstrap-group");
    const loginPasswordGroupEl = document.getElementById("login-password-group");
    const newPasswordGroupEl = document.getElementById("new-password-group");
    const confirmPasswordGroupEl = document.getElementById("confirm-password-group");
    const bootstrapTokenEl = document.getElementById("bootstrap-token");
    const loginPasswordEl = document.getElementById("login-password");
    const newPasswordEl = document.getElementById("new-password");
    const confirmPasswordEl = document.getElementById("confirm-password");
    const authStatusEl = document.getElementById("auth-status");
    const passwordForm = document.getElementById("password-form");
    const currentAdminPasswordEl = document.getElementById("current-admin-password");
    const nextAdminPasswordEl = document.getElementById("next-admin-password");
    const confirmAdminPasswordEl = document.getElementById("confirm-admin-password");
    const passwordStatusEl = document.getElementById("password-status");
    const logoutButton = document.getElementById("logout-button");
    const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));

    let apps = [];
    let currentLang = localStorage.getItem(storageKey) === "zh" ? "zh" : "en";
    let statusState = null;
    let authStatusState = null;
    let passwordStatusState = null;

    const interpolate = (value, params = {}) =>
      String(value).replace(/\\{(\\w+)\\}/g, function (_, key) {
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "";
      });

    const t = (key, params) => {
      const scoped = translations[currentLang] || translations.en;
      const parts = key.split(".");
      let value = scoped;
      for (const part of parts) {
        value = value && value[part];
      }
      return typeof value === "string" ? interpolate(value, params) : key;
    };

    const applyTranslations = (root = document) => {
      document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
      document.title = t("pageTitle");
      root.querySelectorAll("[data-i18n]").forEach((node) => {
        node.textContent = t(node.dataset.i18n);
      });
      root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
        node.placeholder = t(node.dataset.i18nPlaceholder);
      });
    };

    const syncLanguageButtons = () => {
      languageButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.lang === currentLang);
      });
    };

    const renderMode = () => {
      const requiresSetup = !state.adminConfigured;
      authShellEl.classList.toggle("hidden", state.authenticated);
      adminShellEl.classList.toggle("hidden", !state.authenticated);

      bootstrapGroupEl.classList.toggle("hidden", !requiresSetup);
      loginPasswordGroupEl.classList.toggle("hidden", requiresSetup);
      newPasswordGroupEl.classList.remove("hidden");
      confirmPasswordGroupEl.classList.remove("hidden");

      if (requiresSetup) {
        authTitleEl.textContent = t("authSetupTitle");
        authSubtitleEl.textContent = t("authSetupSubtitle");
        authPillEl.textContent = t("authSetupPill");
        authSubmitEl.textContent = t("authSetupButton");
      } else {
        authTitleEl.textContent = t("authLoginTitle");
        authSubtitleEl.textContent = t("authLoginSubtitle");
        authPillEl.textContent = t("authLoginPill");
        authSubmitEl.textContent = t("authLoginButton");
        newPasswordGroupEl.classList.add("hidden");
        confirmPasswordGroupEl.classList.add("hidden");
      }

      formTitle.textContent = appIdEl.value ? t("editApp") : t("newApp");
      submitButton.textContent = t("saveButton");
      listMetaEl.textContent = t("listMeta", { count: apps.length });
    };

    const setStatusTarget = (target, nextState) => {
      target.state = nextState;
      const message = nextState
        ? nextState.mode === "key"
          ? t(nextState.key, nextState.params)
          : nextState.message
        : "";
      target.element.textContent = message || "";
      target.element.className = "status" + (message ? " show" : "") + (nextState && nextState.isError ? " error" : "");
    };

    const statusTarget = { element: statusEl, state: statusState };
    const authStatusTarget = { element: authStatusEl, state: authStatusState };
    const passwordStatusTarget = { element: passwordStatusEl, state: passwordStatusState };

    const setStatusKey = (key, isError = false, params) => {
      setStatusTarget(statusTarget, key ? { mode: "key", key, isError, params: params || {} } : null);
    };

    const setStatusText = (message, isError = false) => {
      setStatusTarget(statusTarget, message ? { mode: "text", message, isError } : null);
    };

    const setAuthStatusKey = (key, isError = false, params) => {
      setStatusTarget(authStatusTarget, key ? { mode: "key", key, isError, params: params || {} } : null);
    };

    const setAuthStatusText = (message, isError = false) => {
      setStatusTarget(authStatusTarget, message ? { mode: "text", message, isError } : null);
    };

    const setPasswordStatusKey = (key, isError = false, params) => {
      setStatusTarget(passwordStatusTarget, key ? { mode: "key", key, isError, params: params || {} } : null);
    };

    const setPasswordStatusText = (message, isError = false) => {
      setStatusTarget(passwordStatusTarget, message ? { mode: "text", message, isError } : null);
    };

    const refreshTranslatedStatus = () => {
      setStatusTarget(statusTarget, statusTarget.state);
      setStatusTarget(authStatusTarget, authStatusTarget.state);
      setStatusTarget(passwordStatusTarget, passwordStatusTarget.state);
    };

    const showResult = (url = "") => {
      resultUrlEl.textContent = url;
      resultEl.className = "result" + (url ? " show" : "");
    };

    const resolveApiError = (payload, fallbackKey) => {
      if (payload && payload.errorCode && t("errors." + payload.errorCode) !== "errors." + payload.errorCode) {
        return t("errors." + payload.errorCode);
      }
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
      }
      return t(fallbackKey);
    };

    const adminHeaders = (includeCsrf = false) => {
      const headers = { "Content-Type": "application/json" };
      if (includeCsrf && state.csrfToken) {
        headers["X-CSRF-Token"] = state.csrfToken;
      }
      return headers;
    };

    const resetForm = () => {
      appIdEl.value = "";
      nameEl.value = "";
      slugEl.value = "";
      rootEl.value = "";
      notesEl.value = "";
      authUsernameEl.value = "";
      authPasswordEl.value = "";
      formTitle.textContent = t("newApp");
      submitButton.textContent = t("saveButton");
      setStatusText("");
      showResult("");
    };

    const formatTime = (value) => {
      try {
        return new Date(value).toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US");
      } catch {
        return value;
      }
    };

    const renderList = () => {
      listEl.innerHTML = "";
      listMetaEl.textContent = t("listMeta", { count: apps.length });
      if (!apps.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = t("emptyState");
        listEl.appendChild(empty);
        return;
      }

      for (const app of apps) {
        const node = template.content.firstElementChild.cloneNode(true);
        applyTranslations(node);
        node.querySelector("[data-name]").textContent = app.name;
        node.querySelector("[data-time]").textContent = formatTime(app.updatedAt);
        node.querySelector("[data-slug]").textContent = "/" + app.slug + "/";
        node.querySelector("[data-url]").textContent = app.accessUrl;
        node.querySelector("[data-root]").textContent = app.rootPrefix;
        node.querySelector("[data-auth]").textContent = app.authEnabled
          ? t("authEnabledWithUser", { username: app.authUsername })
          : t("authDisabled");
        node.querySelector("[data-notes]").textContent = app.notes || t("notesEmpty");

        node.querySelector("[data-edit]").addEventListener("click", () => {
          appIdEl.value = app.id;
          nameEl.value = app.name;
          slugEl.value = app.slug;
          rootEl.value = app.rootPrefix;
          notesEl.value = app.notes || "";
          authUsernameEl.value = app.authUsername || "";
          authPasswordEl.value = "";
          formTitle.textContent = t("editApp");
          submitButton.textContent = t("saveButton");
          setStatusText("");
          showResult("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        node.querySelector("[data-copy]").addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(app.accessUrl);
            setStatusKey("copied");
          } catch {
            setStatusKey("copyFailed", true);
          }
        });

        node.querySelector("[data-delete]").addEventListener("click", async () => {
          const purgeData = confirm(t("deleteConfirm"));
          const response = await fetch(apiBase + "/apps/" + encodeURIComponent(app.id), {
            method: "DELETE",
            credentials: "same-origin",
            headers: adminHeaders(true),
            body: JSON.stringify({ purgeData })
          });
          const data = await response.json();
          if (response.status === 401) {
            location.assign(state.accessPath);
            return;
          }
          if (!response.ok) {
            setStatusText(resolveApiError(data, "deleteFailed"), true);
            return;
          }
          setStatusKey(purgeData ? "deletedPurged" : "deleted");
          if (appIdEl.value === app.id) {
            resetForm();
          }
          await loadApps();
        });

        listEl.appendChild(node);
      }
    };

    const loadApps = async () => {
      const response = await fetch(apiBase + "/apps", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const data = await response.json();
      if (response.status === 401) {
        setStatusKey("sessionExpired", true);
        location.assign(state.accessPath);
        return;
      }
      if (!response.ok) {
        throw new Error(resolveApiError(data, "loadFailed"));
      }
      apps = data.apps || [];
      renderList();
    };

    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const requiresSetup = !state.adminConfigured;
      if (requiresSetup) {
        if (newPasswordEl.value !== confirmPasswordEl.value) {
          setAuthStatusKey("passwordMismatch", true);
          return;
        }
      }

      const payload = requiresSetup
        ? {
            bootstrapToken: bootstrapTokenEl.value,
            newPassword: newPasswordEl.value
          }
        : {
            password: loginPasswordEl.value
          };

      const response = await fetch(apiBase + (requiresSetup ? "/setup" : "/login"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthStatusText(resolveApiError(data, requiresSetup ? "authSetupTitle" : "invalid_credentials"), true);
        return;
      }
      location.assign(state.accessPath);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const appId = appIdEl.value;
      const payload = {
        name: nameEl.value,
        slug: slugEl.value,
        rootPrefix: rootEl.value,
        notes: notesEl.value,
        authUsername: authUsernameEl.value,
        authPassword: authPasswordEl.value
      };

      const response = await fetch(
        appId ? apiBase + "/apps/" + encodeURIComponent(appId) : apiBase + "/apps",
        {
          method: appId ? "PUT" : "POST",
          credentials: "same-origin",
          headers: adminHeaders(true),
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (response.status === 401) {
        location.assign(state.accessPath);
        return;
      }
      if (!response.ok) {
        setStatusText(resolveApiError(data, "saveFailed"), true);
        return;
      }

      setStatusKey(appId ? "saved" : "created");
      showResult(data.createdUrl || data.app?.accessUrl || "");
      if (!appId) {
        const createdUrl = data.createdUrl || "";
        resetForm();
        showResult(createdUrl);
        setStatusKey("created");
      }
      await loadApps();
    });

    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (nextAdminPasswordEl.value !== confirmAdminPasswordEl.value) {
        setPasswordStatusKey("passwordMismatch", true);
        return;
      }
      const response = await fetch(apiBase + "/password", {
        method: "POST",
        credentials: "same-origin",
        headers: adminHeaders(true),
        body: JSON.stringify({
          currentPassword: currentAdminPasswordEl.value,
          newPassword: nextAdminPasswordEl.value
        })
      });
      const data = await response.json();
      if (response.status === 401) {
        location.assign(state.accessPath);
        return;
      }
      if (!response.ok) {
        setPasswordStatusText(resolveApiError(data, "passwordUpdated"), true);
        return;
      }
      currentAdminPasswordEl.value = "";
      nextAdminPasswordEl.value = "";
      confirmAdminPasswordEl.value = "";
      setPasswordStatusKey("passwordUpdated");
    });

    logoutButton.addEventListener("click", async () => {
      const response = await fetch(apiBase + "/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: adminHeaders(true)
      });
      if (!response.ok) {
        setPasswordStatusKey("logoutFailed", true);
        return;
      }
      location.assign(state.accessPath);
    });

    resetButton.addEventListener("click", resetForm);
    refreshButton.addEventListener("click", async () => {
      try {
        await loadApps();
        setStatusKey("refreshed");
      } catch (error) {
        setStatusText(error.message || t("refreshFailed"), true);
      }
    });

    languageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        currentLang = button.dataset.lang === "zh" ? "zh" : "en";
        localStorage.setItem(storageKey, currentLang);
        syncLanguageButtons();
        applyTranslations(document);
        renderMode();
        refreshTranslatedStatus();
        renderList();
      });
    });

    syncLanguageButtons();
    applyTranslations(document);
    renderMode();

    if (state.authenticated) {
      loadApps().catch((error) => {
        setStatusText(error.message || t("initFailed"), true);
      });
    }
  </script>
</body>
</html>`;
}
