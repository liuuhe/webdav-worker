import { z } from "zod"

import type { Locale } from "@/lib/i18n"

export function setupSchema(locale: Locale) {
  const t = text(locale)
  return z.object({
    bootstrapToken: z.string().trim().min(1, t("Bootstrap token is required.", "Bootstrap Token 不能为空。")),
    newPassword: z.string().min(1, t("A new admin password is required.", "必须填写新的管理员密码。")),
  })
}

export function loginSchema(locale: Locale) {
  const t = text(locale)
  return z.object({
    password: z.string().min(1, t("Password is required.", "密码不能为空。")),
  })
}

export function changePasswordSchema(locale: Locale) {
  const t = text(locale)
  return z
    .object({
      currentPassword: z.string().min(1, t("Current admin password is required.", "必须填写当前管理员密码。")),
      newPassword: z.string().min(1, t("A new admin password is required.", "必须填写新的管理员密码。")),
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
      message: t("Use a new password that differs from the current one.", "新密码不能与当前密码相同。"),
      path: ["newPassword"],
    })
}

export function createAppSchema(locale: Locale) {
  const t = text(locale)
  return baseAppSchema(locale).superRefine((value, ctx) => {
    if (!value.authEnabled) {
      return
    }

    if (!value.authUsername.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authUsername"],
        message: t("A username is required when auth is enabled.", "启用认证时必须填写用户名。"),
      })
    }

    if (!value.authPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authPassword"],
        message: t("A password is required the first time you enable auth.", "首次启用认证时必须填写密码。"),
      })
    }
  })
}

export function editAppSchema(locale: Locale) {
  const t = text(locale)
  return baseAppSchema(locale).superRefine((value, ctx) => {
    if (!value.authEnabled) {
      return
    }

    if (!value.authUsername.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authUsername"],
        message: t("A username is required when auth is enabled.", "启用认证时必须填写用户名。"),
      })
    }
  })
}

function baseAppSchema(locale: Locale) {
  const t = text(locale)
  return z.object({
    name: z.string().trim().min(1, t("Name is required.", "名称不能为空。")).max(80, t("Name is too long.", "名称过长。")),
    slug: z
      .string()
      .trim()
      .min(2, t("App path is required.", "应用路径不能为空。"))
      .max(64, t("App path is too long.", "应用路径过长。"))
      .regex(/^[a-zA-Z0-9-]+$/, t("App path may only contain letters, numbers, and hyphens.", "应用路径只能包含字母、数字和连字符。"))
      .refine((value) => value.toLowerCase() !== "manage", t("This app path is reserved.", "该应用路径为保留路径。")),
    rootPrefix: z
      .string()
      .trim()
      .min(1, t("Storage path is required.", "存储路径不能为空。"))
      .refine((value) => {
        const trimmed = value.replace(/^\/+|\/+$/g, "")
        const segments = trimmed.split("/").filter(Boolean)
        return segments.length > 0 && segments.every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment))
      }, t("Storage path may only contain letters, numbers, dots, underscores, hyphens, and forward slashes.", "存储路径只能包含字母、数字、点、下划线、连字符和正斜杠。")),
    notes: z.string(),
    authEnabled: z.boolean(),
    authUsername: z
      .string()
      .trim()
      .max(64, t("Username cannot be longer than 64 characters.", "用户名不能超过 64 个字符。"))
      .refine((value) => value === "" || (!value.includes(":") && !/\s/.test(value)), t("Username cannot contain whitespace or a colon.", "用户名不能包含空白字符或冒号。")),
    authPassword: z.string(),
  })
}

function text(locale: Locale) {
  return (en: string, zhCN: string) => (locale === "zh-CN" ? zhCN : en)
}
