import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheckIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { setupAdmin } from "@/lib/api"
import { setupSchema } from "@/lib/schemas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

type SetupValues = z.infer<typeof setupSchema>

type SetupScreenProps = {
  onConfigured: () => Promise<void>
}

export function SetupScreen({ onConfigured }: SetupScreenProps) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      bootstrapToken: "",
      newPassword: "",
    },
  })

  async function onSubmit(values: SetupValues) {
    setSubmitting(true)
    try {
      await setupAdmin(values.bootstrapToken, values.newPassword)
      toast.success("Admin access is ready.")
      await onConfigured()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to finish setup."
      toast.error(message)
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
              First-time setup
            </p>
            <h1 className="max-w-2xl font-heading text-4xl tracking-tight text-foreground lg:text-6xl">
              Turn the Worker into your control plane.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Use the one-time bootstrap token from Cloudflare Secrets, set the permanent admin password, then switch to the new
              dashboard to create and manage WebDAV apps.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>What happens now</CardTitle>
                <CardDescription>The bootstrap token is only used once.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>Create the long-term admin password.</p>
                <p>Start a session under <code>/manage</code>.</p>
                <p>Switch future access to password + session cookie.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recommended next step</CardTitle>
                <CardDescription>Create your first app right after setup.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>Give the app a short path like <code>notes</code>.</p>
                <p>Pick an isolated storage prefix like <code>notes/</code>.</p>
                <p>Enable Basic Auth only if the client requires it.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Initialize admin access</CardTitle>
            <CardDescription>Both fields stay inside your Worker boundary.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.bootstrapToken)}>
                  <FieldLabel htmlFor="bootstrapToken">Bootstrap token</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>Secret</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="bootstrapToken"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.bootstrapToken)}
                        {...form.register("bootstrapToken")}
                      />
                    </InputGroup>
                    <FieldDescription>Use the current Worker secret stored as <code>ADMIN_TOKEN</code>.</FieldDescription>
                    <FieldError errors={[form.formState.errors.bootstrapToken]} />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(form.formState.errors.newPassword)}>
                  <FieldLabel htmlFor="newPassword">New admin password</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>Password</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="newPassword"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.newPassword)}
                        {...form.register("newPassword")}
                      />
                    </InputGroup>
                    <FieldDescription>This becomes the long-term password for the manage console.</FieldDescription>
                    <FieldError errors={[form.formState.errors.newPassword]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              <Button disabled={submitting} size="lg" type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <ShieldCheckIcon data-icon="inline-start" />}
                Finish setup
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
