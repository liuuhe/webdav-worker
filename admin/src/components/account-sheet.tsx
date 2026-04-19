import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { LogOutIcon, ShieldIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { changePasswordSchema } from "@/lib/schemas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

type AccountSheetProps = {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  onLogout: () => Promise<void>
}

export function AccountSheet({ onChangePassword, onLogout }: AccountSheetProps) {
  const [submitting, setSubmitting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
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
      toast.success("Admin password updated.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the password."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await onLogout()
      toast.success("Signed out.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign out."
      toast.error(message)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <ShieldIcon data-icon="inline-start" />
          Security
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Admin security</SheetTitle>
          <SheetDescription>Rotate the admin password or end the current session.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Rotate admin password</CardTitle>
              <CardDescription>All existing sessions are revoked when the password changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.currentPassword)}>
                    <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>Current</InputGroupText>
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
                    <FieldLabel htmlFor="nextPassword">New password</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>Next</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="nextPassword"
                          type="password"
                          aria-invalid={Boolean(form.formState.errors.newPassword)}
                          {...form.register("newPassword")}
                        />
                      </InputGroup>
                      <FieldDescription>Use a new password and update your password managers right after saving.</FieldDescription>
                      <FieldError errors={[form.formState.errors.newPassword]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <Button disabled={submitting} type="submit">
                  {submitting ? <Spinner data-icon="inline-start" /> : <ShieldIcon data-icon="inline-start" />}
                  Save new password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle>Session control</CardTitle>
              <CardDescription>End the current admin session on this device.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={loggingOut} variant="ghost" onClick={() => void handleLogout()}>
                {loggingOut ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />}
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
