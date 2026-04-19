import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheckIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { setupAdmin } from "@/lib/api"
import { setupSchema } from "@/lib/schemas"
import { resolveErrorMessage, useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

type SetupValues = z.infer<ReturnType<typeof setupSchema>>

type SetupScreenProps = {
  onConfigured: () => Promise<void>
}

export function SetupScreen({ onConfigured }: SetupScreenProps) {
  const { locale, text } = useI18n()
  const [submitting, setSubmitting] = useState(false)
  const schema = useMemo(() => setupSchema(locale), [locale])
  const form = useForm<SetupValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bootstrapToken: "",
      newPassword: "",
    },
  })

  async function onSubmit(values: SetupValues) {
    setSubmitting(true)
    try {
      await setupAdmin(values.bootstrapToken, values.newPassword)
      toast.success(text("Admin access is ready.", "管理员访问已就绪。"))
      await onConfigured()
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to finish setup."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col justify-center gap-8 px-6 py-10 lg:flex-row lg:items-center lg:gap-12">
        <section className="flex flex-1 flex-col gap-6">
          <div className="flex size-12 items-center justify-center rounded-2xl border bg-card">
            <ShieldCheckIcon />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              {text("First-time setup", "首次初始化")}
            </p>
            <h1 className="max-w-2xl font-heading text-4xl tracking-tight text-foreground lg:text-6xl">
              {text("Turn the Worker into your control plane.", "把 Worker 变成你的控制平面。")}
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              {text(
                "Use the one-time bootstrap token from Cloudflare Secrets, set the permanent admin password, then switch to the new dashboard to create and manage WebDAV apps.",
                "使用 Cloudflare Secrets 中的一次性 bootstrap token 设置永久管理员密码，然后进入新控制台创建和管理 WebDAV 应用。",
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{text("What happens now", "接下来会发生什么")}</CardTitle>
                <CardDescription>{text("The bootstrap token is only used once.", "bootstrap token 只会使用一次。")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>{text("Create the long-term admin password.", "设置长期管理员密码。")}</p>
                <p>{text("Start a session under ", "在 ")}<code>/manage</code>{text(".", " 下启动会话。")}</p>
                <p>{text("Switch future access to password + session cookie.", "后续通过密码 + 会话 Cookie 访问。")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{text("Recommended next step", "推荐下一步")}</CardTitle>
                <CardDescription>{text("Create your first app right after setup.", "初始化完成后立即创建第一个应用。")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  {text("Use a short app path like ", "建议使用简短应用路径，如 ")}
                  <code>notes</code>
                  {text(".", "。")}
                </p>
                <p>
                  {text("Pick an isolated storage prefix like ", "选择隔离的存储前缀，如 ")}
                  <code>notes/</code>
                  {text(".", "。")}
                </p>
                <p>{text("Enable Basic Auth only if the client requires it.", "仅在客户端确实需要时再启用 Basic Auth。")}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>{text("Initialize admin access", "初始化管理员访问")}</CardTitle>
            <CardDescription>{text("Both fields stay inside your Worker boundary.", "这两个字段都只在你的 Worker 边界内处理。")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
                <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.bootstrapToken)}>
                  <FieldLabel htmlFor="bootstrapToken">{text("Bootstrap token", "Bootstrap Token")}</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>{text("Secret", "密钥")}</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="bootstrapToken"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.bootstrapToken)}
                        {...form.register("bootstrapToken")}
                      />
                    </InputGroup>
                    <FieldDescription>
                      {text("Use the current Worker secret stored as ", "使用当前 Worker 中保存的 secret：")}
                      <code>ADMIN_TOKEN</code>
                      {text(".", "。")}
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.bootstrapToken]} />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(form.formState.errors.newPassword)}>
                  <FieldLabel htmlFor="newPassword">{text("New admin password", "新管理员密码")}</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>{text("Password", "密码")}</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="newPassword"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.newPassword)}
                        {...form.register("newPassword")}
                      />
                    </InputGroup>
                    <FieldDescription>{text("This becomes the long-term password for the manage console.", "这将成为管理后台长期使用的密码。")}</FieldDescription>
                    <FieldError errors={[form.formState.errors.newPassword]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              <Button disabled={submitting} size="lg" type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <ShieldCheckIcon data-icon="inline-start" />}
                {text("Finish setup", "完成初始化")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
