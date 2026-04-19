import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

export type Locale = "en" | "zh-CN"

const LOCALE_STORAGE_KEY = "manage_locale"

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  text: (en: string, zhCN: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale())

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      text: (en: string, zhCN: string) => (locale === "zh-CN" ? zhCN : en),
    }),
    [locale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.")
  }
  return context
}

export function resolveErrorMessage(error: unknown, text: (en: string, zhCN: string) => string, fallback: string) {
  const fallbackMessage = text(fallback, "请求失败，请稍后重试。")
  if (!error || typeof error !== "object") {
    return fallbackMessage
  }

  const errorCode =
    "errorCode" in error && typeof (error as { errorCode?: unknown }).errorCode === "string"
      ? (error as { errorCode: string }).errorCode
      : null
  if (!errorCode) {
    return "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message || fallbackMessage)
      : fallbackMessage
  }

  const localized = ADMIN_ERROR_MAP[errorCode]
  if (!localized) {
    return "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message || fallbackMessage)
      : fallbackMessage
  }

  return text(localized.en, localized.zhCN)
}

const ADMIN_ERROR_MAP: Record<string, { en: string; zhCN: string }> = {
  invalid_json: {
    en: "The request body must be valid JSON.",
    zhCN: "请求体必须是合法 JSON。",
  },
  internal_error: {
    en: "Internal server error.",
    zhCN: "服务器内部错误。",
  },
  app_not_found: {
    en: "App not found.",
    zhCN: "未找到应用。",
  },
  path_in_use: {
    en: "This app path is already in use.",
    zhCN: "该应用路径已被占用。",
  },
  storage_prefix_in_use: {
    en: "This storage path is already used by another app.",
    zhCN: "该存储路径已被其他应用使用。",
  },
  name_required: {
    en: "Name is required.",
    zhCN: "名称不能为空。",
  },
  name_too_long: {
    en: "Name is too long.",
    zhCN: "名称过长。",
  },
  storage_prefix_required: {
    en: "Storage path is required.",
    zhCN: "存储路径不能为空。",
  },
  storage_prefix_invalid: {
    en: "Storage path may only contain letters, numbers, dots, underscores, hyphens, and forward slashes.",
    zhCN: "存储路径只能包含字母、数字、点、下划线、连字符和正斜杠。",
  },
  notes_invalid: {
    en: "Notes must be a string.",
    zhCN: "备注必须是字符串。",
  },
  path_required: {
    en: "App path is required.",
    zhCN: "应用路径不能为空。",
  },
  path_invalid: {
    en: "App path may only contain letters, numbers, and hyphens.",
    zhCN: "应用路径只能包含字母、数字和连字符。",
  },
  path_reserved: {
    en: "This app path is reserved.",
    zhCN: "该应用路径为保留路径。",
  },
  username_invalid: {
    en: "Username must be a string.",
    zhCN: "用户名必须是字符串。",
  },
  username_format_invalid: {
    en: "Username cannot contain whitespace or a colon, and must be 64 characters or fewer.",
    zhCN: "用户名不能包含空白字符或冒号，且长度不能超过 64 个字符。",
  },
  password_invalid: {
    en: "Password must be a string.",
    zhCN: "密码必须是字符串。",
  },
  username_required_for_password: {
    en: "A username is required when a password is set.",
    zhCN: "设置密码时必须填写用户名。",
  },
  password_required_for_auth: {
    en: "A password is required the first time you enable auth.",
    zhCN: "首次启用认证时必须设置密码。",
  },
  password_empty: {
    en: "Password cannot be empty.",
    zhCN: "密码不能为空。",
  },
  invalid_credentials: {
    en: "Invalid admin password.",
    zhCN: "管理员密码错误。",
  },
  setup_required: {
    en: "Admin setup is required before login.",
    zhCN: "请先完成管理员初始化配置。",
  },
  already_configured: {
    en: "Admin access is already configured.",
    zhCN: "管理员访问已配置。",
  },
  current_password_invalid: {
    en: "Current admin password is incorrect.",
    zhCN: "当前管理员密码不正确。",
  },
  new_password_required: {
    en: "A new admin password is required.",
    zhCN: "必须填写新管理员密码。",
  },
  bootstrap_token_invalid: {
    en: "The bootstrap token is invalid.",
    zhCN: "bootstrap token 无效。",
  },
  too_many_attempts: {
    en: "Too many failed login attempts. Try again later.",
    zhCN: "登录失败次数过多，请稍后再试。",
  },
  admin_session_required: {
    en: "Admin authentication is required.",
    zhCN: "需要管理员登录后才能继续。",
  },
  csrf_invalid: {
    en: "The CSRF token is invalid.",
    zhCN: "CSRF token 无效。",
  },
}

function detectInitialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (saved === "zh-CN" || saved === "en") {
    return saved
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
}
