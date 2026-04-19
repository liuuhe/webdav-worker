import { z } from "zod"

const appNameSchema = z.string().trim().min(1, "Name is required.").max(80, "Name is too long.")
const appSlugSchema = z
  .string()
  .trim()
  .min(2, "App path is required.")
  .max(64, "App path is too long.")
  .regex(/^[a-zA-Z0-9-]+$/, "App path may only contain letters, numbers, and hyphens.")
  .refine((value) => value.toLowerCase() !== "manage", "This app path is reserved.")
const rootPrefixSchema = z
  .string()
  .trim()
  .min(1, "Storage path is required.")
  .refine((value) => {
    const trimmed = value.replace(/^\/+|\/+$/g, "")
    const segments = trimmed.split("/").filter(Boolean)
    return segments.length > 0 && segments.every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment))
  }, "Storage path may only contain letters, numbers, dots, underscores, hyphens, and forward slashes.")
const authUsernameSchema = z
  .string()
  .trim()
  .max(64, "Username cannot be longer than 64 characters.")
  .refine((value) => value === "" || (!value.includes(":") && !/\s/.test(value)), "Username cannot contain whitespace or a colon.")

export const setupSchema = z.object({
  bootstrapToken: z.string().trim().min(1, "Bootstrap token is required."),
  newPassword: z.string().min(1, "A new admin password is required."),
})

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required."),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current admin password is required."),
    newPassword: z.string().min(1, "A new admin password is required."),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Use a new password that differs from the current one.",
    path: ["newPassword"],
  })

const baseAppSchema = z.object({
  name: appNameSchema,
  slug: appSlugSchema,
  rootPrefix: rootPrefixSchema,
  notes: z.string(),
  authEnabled: z.boolean(),
  authUsername: authUsernameSchema,
  authPassword: z.string(),
})

export const createAppSchema = baseAppSchema.superRefine((value, ctx) => {
  if (!value.authEnabled) {
    return
  }

  if (!value.authUsername.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["authUsername"],
      message: "A username is required when auth is enabled.",
    })
  }

  if (!value.authPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["authPassword"],
      message: "A password is required the first time you enable auth.",
    })
  }
})

export const editAppSchema = baseAppSchema.superRefine((value, ctx) => {
  if (!value.authEnabled) {
    return
  }

  if (!value.authUsername.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["authUsername"],
      message: "A username is required when auth is enabled.",
    })
  }
})
