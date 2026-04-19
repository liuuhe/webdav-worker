import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, GlobeIcon, KeyRoundIcon, ServerIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { createApp } from "@/lib/api"
import { createAppSchema } from "@/lib/schemas"
import { resolveErrorMessage, useI18n } from "@/lib/i18n"
import type { AppFormValues, PublicApp } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

type CreateValues = z.infer<ReturnType<typeof createAppSchema>>

type CreateAppPageProps = {
  csrfToken: string
  onCreated: (app: PublicApp) => void
}

const DEFAULT_VALUES: AppFormValues = {
  name: "",
  slug: "",
  rootPrefix: "",
  notes: "",
  authEnabled: false,
  authUsername: "",
  authPassword: "",
}

export function CreateAppPage({ csrfToken, onCreated }: CreateAppPageProps) {
  const { locale, text } = useI18n()
  const [submitting, setSubmitting] = useState(false)
  const schema = useMemo(() => createAppSchema(locale), [locale])
  const form = useForm<CreateValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  const preview = useMemo(() => {
      const values = form.getValues()
      return {
        path: values.slug.trim() ? `/${values.slug.trim().toLowerCase()}/` : "/your-app/",
        rootPrefix: values.rootPrefix.trim() ? normalizePrefix(values.rootPrefix) : "your-prefix/",
        authLabel: values.authEnabled ? values.authUsername.trim() || text("Enabled", "已启用") : text("Disabled", "已禁用"),
      }
  }, [form.watch(), text])

  async function submit(values: CreateValues) {
    setSubmitting(true)
    try {
      const response = await createApp(values, csrfToken)
      toast.success(text("App created.", "应用已创建。"))
      form.reset(DEFAULT_VALUES)
      onCreated(response.data.app)
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to create the app."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-none bg-gradient-to-br from-card via-card to-muted/40 shadow-none">
        <CardContent className="flex h-full flex-col gap-8 p-8">
          <div className="flex flex-col gap-4">
            <Badge variant="secondary" className="w-fit">{text("Create flow", "创建流程")}</Badge>
            <div className="flex flex-col gap-3">
              <h2 className="font-heading text-3xl tracking-tight">{text("Design the public path and storage lane before anything else.", "先设计公网路径和存储前缀，再做其他配置。")}</h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                {text(
                  "Creation is intentionally front-loaded: choose a path your clients will keep forever, then map it to a clean storage prefix and decide whether Basic Auth belongs on this endpoint.",
                  "创建流程强调先定基础：先选择客户端长期使用的路径，再映射到清晰的存储前缀，并决定是否启用 Basic Auth。",
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
              <PreviewTile
                icon={<GlobeIcon />}
                title={text("Public URL", "公网 URL")}
                value={preview.path}
                description={text("The stable endpoint WebDAV clients will connect to.", "WebDAV 客户端将连接到的稳定端点。")}
              />
              <PreviewTile
                icon={<ServerIcon />}
                title={text("Storage prefix", "存储前缀")}
                value={preview.rootPrefix}
                description={text("The R2 branch reserved for this app.", "该应用专用的 R2 前缀分支。")}
              />
              <PreviewTile
                icon={<KeyRoundIcon />}
                title={text("Auth mode", "认证模式")}
                value={preview.authLabel}
                description={text("Basic Auth is optional and per app.", "Basic Auth 为每应用可选。")}
              />
            </div>

          <Card>
            <CardHeader>
              <CardTitle>{text("What the create flow optimizes for", "创建流程优化目标")}</CardTitle>
              <CardDescription>{text("Get one app online fast, with clean defaults.", "使用清晰默认值，快速上线单个应用。")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
              <p>{text("Paths stay short and memorable.", "路径保持简短易记。")}</p>
              <p>{text("Storage prefixes stay isolated and predictable.", "存储前缀保持隔离且可预测。")}</p>
              <p>{text("Auth remains explicit instead of silently inherited.", "认证策略保持显式配置，避免隐式继承。")}</p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>{text("New app", "新建应用")}</CardTitle>
            <CardDescription>{text("Create the route, storage prefix, and optional auth policy in one pass.", "一次性创建路由、存储前缀和可选认证策略。")}</CardDescription>
          </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="create-name">{text("Display name", "显示名称")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="create-name"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    placeholder={text("Notes workspace", "笔记空间")}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.slug)}>
                <FieldLabel htmlFor="create-slug">{text("App path", "应用路径")}</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="create-slug"
                      aria-invalid={Boolean(form.formState.errors.slug)}
                      placeholder={text("notes", "notes")}
                      {...form.register("slug")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>/</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{text("The public WebDAV path segment. Keep it short and stable.", "公开 WebDAV 路径段，建议保持简短稳定。")}</FieldDescription>
                  <FieldError errors={[form.formState.errors.slug]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.rootPrefix)}>
                <FieldLabel htmlFor="create-prefix">{text("Storage prefix", "存储前缀")}</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>R2</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="create-prefix"
                      aria-invalid={Boolean(form.formState.errors.rootPrefix)}
                      placeholder={text("notes/", "notes/")}
                      {...form.register("rootPrefix")}
                    />
                  </InputGroup>
                  <FieldDescription>{text("The Worker will reserve this branch of the shared bucket for the new app.", "Worker 会在共享 Bucket 中为新应用预留该前缀分支。")}</FieldDescription>
                  <FieldError errors={[form.formState.errors.rootPrefix]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.notes)}>
                <FieldLabel htmlFor="create-notes">{text("Operational notes", "运维备注")}</FieldLabel>
                <FieldContent>
                  <InputGroup className="min-h-28 items-stretch">
                    <InputGroupTextarea
                      id="create-notes"
                      className="min-h-28"
                      aria-invalid={Boolean(form.formState.errors.notes)}
                      placeholder={text("Client, owner, or migration context.", "客户端、负责人或迁移背景。")}
                      {...form.register("notes")}
                    />
                  </InputGroup>
                  <FieldDescription>{text("Optional context for future maintenance.", "用于后续维护的可选上下文信息。")}</FieldDescription>
                  <FieldError errors={[form.formState.errors.notes]} />
                </FieldContent>
              </Field>

              <Controller
                control={form.control}
                name="authEnabled"
                render={({ field }) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="create-auth">{text("Enable WebDAV Basic Auth", "启用 WebDAV Basic Auth")}</FieldLabel>
                    <FieldContent>
                      <div className="flex items-center justify-end">
                        <Switch id="create-auth" checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                      <FieldDescription>{text("Add a per-app username and password in front of WebDAV access.", "为该应用设置独立用户名和密码，保护 WebDAV 访问。")}</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />

              {form.watch("authEnabled") && (
                <>
                  <Field data-invalid={Boolean(form.formState.errors.authUsername)}>
                    <FieldLabel htmlFor="create-auth-username">{text("Auth username", "认证用户名")}</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-auth-username"
                        aria-invalid={Boolean(form.formState.errors.authUsername)}
                        placeholder={text("alice", "alice")}
                        {...form.register("authUsername")}
                      />
                      <FieldError errors={[form.formState.errors.authUsername]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.authPassword)}>
                    <FieldLabel htmlFor="create-auth-password">{text("Auth password", "认证密码")}</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-auth-password"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.authPassword)}
                        placeholder={text("Set the initial WebDAV password", "设置初始 WebDAV 密码")}
                        {...form.register("authPassword")}
                      />
                      <FieldDescription>{text("This password is hashed inside the Worker before storage.", "该密码会在 Worker 内部哈希后再保存。")}</FieldDescription>
                      <FieldError errors={[form.formState.errors.authPassword]} />
                    </FieldContent>
                  </Field>
                </>
              )}
            </FieldGroup>

            <Button disabled={submitting} size="lg" type="submit">
              {submitting ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
              {text("Create app", "创建应用")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function PreviewTile({
  icon,
  title,
  value,
  description,
}: {
  icon: ReactNode
  title: string
  value: string
  description: string
}) {
  return (
    <Card className="bg-background/80">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
          {icon}
        </div>
        <div className="flex flex-col gap-1">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="font-mono text-sm">{value}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  )
}

function normalizePrefix(value: string) {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "")
  return trimmed ? `${trimmed}/` : "your-prefix/"
}
