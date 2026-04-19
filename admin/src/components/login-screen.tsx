import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { LockKeyholeIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { loginAdmin } from "@/lib/api"
import { loginSchema } from "@/lib/schemas"
import { resolveErrorMessage, useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

type LoginValues = z.infer<ReturnType<typeof loginSchema>>

type LoginScreenProps = {
  onAuthenticated: () => Promise<void>
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const { locale, text } = useI18n()
  const [submitting, setSubmitting] = useState(false)
  const schema = useMemo(() => loginSchema(locale), [locale])
  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
    },
  })

  async function onSubmit(values: LoginValues) {
    setSubmitting(true)
    try {
      await loginAdmin(values.password)
      toast.success(text("Signed in.", "登录成功。"))
      await onAuthenticated()
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to sign in."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex flex-1 flex-col gap-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">{text("Admin sign-in", "管理员登录")}</p>
          <div className="flex flex-col gap-3">
            <h1 className="max-w-2xl font-heading text-4xl tracking-tight text-foreground lg:text-6xl">
              {text("Operate multiple WebDAV apps from one console.", "在一个控制台中管理多个 WebDAV 应用。")}
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              {text("The admin console controls app paths, storage prefixes, authentication settings, and destructive cleanup operations.", "管理控制台可统一管理应用路径、存储前缀、认证设置和清理操作。")}
            </p>
          </div>
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>{text("Before you continue", "开始前须知")}</CardTitle>
              <CardDescription>{text("The dashboard can modify app routing and storage mappings.", "该控制台可以修改应用路由和存储映射。")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                {text("App paths are public-facing URLs such as ", "应用路径是对外可访问 URL，例如 ")}
                <code>/notes/</code>
                {text(".", "。")}
              </p>
              <p>{text("Storage prefixes isolate each app inside the shared R2 bucket.", "存储前缀用于在共享 R2 Bucket 内隔离不同应用。")}</p>
              <p>{text("Changing auth settings affects how WebDAV clients connect.", "修改认证设置会影响 WebDAV 客户端的连接方式。")}</p>
            </CardContent>
          </Card>
        </section>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{text("Enter admin password", "输入管理员密码")}</CardTitle>
            <CardDescription>{text("Sessions last 7 days unless you rotate the password or log out.", "会话默认有效期为 7 天，除非你修改密码或主动登出。")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.password)}>
                  <FieldLabel htmlFor="password">{text("Password", "密码")}</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>{text("Admin", "管理员")}</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="password"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.password)}
                        {...form.register("password")}
                      />
                    </InputGroup>
                    <FieldDescription>{text("Rate limits apply after repeated failed attempts.", "连续多次失败后会触发登录限流。")}</FieldDescription>
                    <FieldError errors={[form.formState.errors.password]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              <Button disabled={submitting} size="lg" type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
                {text("Sign in", "登录")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
