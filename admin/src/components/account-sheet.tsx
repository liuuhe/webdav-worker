import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { LogOutIcon, ShieldIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { changePasswordSchema } from "@/lib/schemas"
import { resolveErrorMessage, useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

type ChangePasswordValues = z.infer<ReturnType<typeof changePasswordSchema>>

type AccountSheetProps = {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  onLogout: () => Promise<void>
}

export function AccountSheet({ onChangePassword, onLogout }: AccountSheetProps) {
  const { locale, text } = useI18n()
  const [submitting, setSubmitting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const schema = useMemo(() => changePasswordSchema(locale), [locale])
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
    },
  })

  async function submit(values: ChangePasswordValues) {
    setSubmitting(true)
    try {
      await onChangePassword(values.currentPassword, values.newPassword)
      form.reset()
      toast.success(text("Admin password updated.", "管理员密码已更新。"))
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to update the password."))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await onLogout()
      toast.success(text("Signed out.", "已登出。"))
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to sign out."))
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <ShieldIcon data-icon="inline-start" />
          {text("Security", "安全")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{text("Admin security", "管理员安全")}</SheetTitle>
          <SheetDescription>{text("Rotate the admin password or end the current session.", "修改管理员密码或结束当前会话。")}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{text("Rotate admin password", "修改管理员密码")}</CardTitle>
              <CardDescription>{text("All existing sessions are revoked when the password changes.", "密码修改后，所有现有会话都会失效。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.currentPassword)}>
                    <FieldLabel htmlFor="currentPassword">{text("Current password", "当前密码")}</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>{text("Current", "当前")}</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="currentPassword"
                          type="password"
                          aria-invalid={Boolean(form.formState.errors.currentPassword)}
                          {...form.register("currentPassword")}
                        />
                      </InputGroup>
                      <FieldError errors={[form.formState.errors.currentPassword]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.newPassword)}>
                    <FieldLabel htmlFor="nextPassword">{text("New password", "新密码")}</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>{text("Next", "新的")}</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="nextPassword"
                          type="password"
                          aria-invalid={Boolean(form.formState.errors.newPassword)}
                          {...form.register("newPassword")}
                        />
                      </InputGroup>
                      <FieldDescription>{text("Use a new password and update your password managers right after saving.", "请使用新密码，并在保存后同步更新密码管理器。")}</FieldDescription>
                      <FieldError errors={[form.formState.errors.newPassword]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <Button disabled={submitting} type="submit">
                  {submitting ? <Spinner data-icon="inline-start" /> : <ShieldIcon data-icon="inline-start" />}
                  {text("Save new password", "保存新密码")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle>{text("Session control", "会话管理")}</CardTitle>
              <CardDescription>{text("End the current admin session on this device.", "结束此设备上的当前管理员会话。")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={loggingOut} variant="ghost" onClick={() => void handleLogout()}>
                {loggingOut ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />}
                {text("Sign out", "退出登录")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
