import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { LockKeyholeIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { loginAdmin } from "@/lib/api"
import { loginSchema } from "@/lib/schemas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

type LoginValues = z.infer<typeof loginSchema>

type LoginScreenProps = {
  onAuthenticated: () => Promise<void>
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      password: "",
    },
  })

  async function onSubmit(values: LoginValues) {
    setSubmitting(true)
    try {
      await loginAdmin(values.password)
      toast.success("Signed in.")
      await onAuthenticated()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex flex-1 flex-col gap-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Admin sign-in</p>
          <div className="flex flex-col gap-3">
            <h1 className="max-w-2xl font-heading text-4xl tracking-tight text-foreground lg:text-6xl">
              Operate multiple WebDAV apps from one console.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              The admin console controls app paths, storage prefixes, authentication settings, and destructive cleanup operations.
            </p>
          </div>
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Before you continue</CardTitle>
              <CardDescription>The dashboard can modify app routing and storage mappings.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>App paths are public-facing URLs such as <code>/notes/</code>.</p>
              <p>Storage prefixes isolate each app inside the shared R2 bucket.</p>
              <p>Changing auth settings affects how WebDAV clients connect.</p>
            </CardContent>
          </Card>
        </section>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Enter admin password</CardTitle>
            <CardDescription>Sessions last 7 days unless you rotate the password or log out.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.password)}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>Admin</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="password"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.password)}
                        {...form.register("password")}
                      />
                    </InputGroup>
                    <FieldDescription>Rate limits apply after repeated failed attempts.</FieldDescription>
                    <FieldError errors={[form.formState.errors.password]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              <Button disabled={submitting} size="lg" type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
