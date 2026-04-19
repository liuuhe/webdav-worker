import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, GlobeIcon, KeyRoundIcon, ServerIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { createApp } from "@/lib/api"
import { createAppSchema } from "@/lib/schemas"
import type { AppFormValues, PublicApp } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

type CreateValues = z.infer<typeof createAppSchema>

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
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<CreateValues>({
    resolver: zodResolver(createAppSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const preview = useMemo(() => {
    const values = form.getValues()
    return {
      path: values.slug.trim() ? `/${values.slug.trim().toLowerCase()}/` : "/your-app/",
      rootPrefix: values.rootPrefix.trim() ? normalizePrefix(values.rootPrefix) : "your-prefix/",
      authLabel: values.authEnabled ? values.authUsername.trim() || "Enabled" : "Disabled",
    }
  }, [form.watch()])

  async function submit(values: CreateValues) {
    setSubmitting(true)
    try {
      const response = await createApp(values, csrfToken)
      toast.success("App created.")
      form.reset(DEFAULT_VALUES)
      onCreated(response.data.app)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create the app."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-none bg-gradient-to-br from-card via-card to-muted/40 shadow-none">
        <CardContent className="flex h-full flex-col gap-8 p-8">
          <div className="flex flex-col gap-4">
            <Badge variant="secondary" className="w-fit">Create flow</Badge>
            <div className="flex flex-col gap-3">
              <h2 className="font-heading text-3xl tracking-tight">Design the public path and storage lane before anything else.</h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                Creation is intentionally front-loaded: choose a path your clients will keep forever, then map it to a clean storage prefix and decide whether Basic Auth belongs on this endpoint.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <PreviewTile
              icon={<GlobeIcon />}
              title="Public URL"
              value={preview.path}
              description="The stable endpoint WebDAV clients will connect to."
            />
            <PreviewTile
              icon={<ServerIcon />}
              title="Storage prefix"
              value={preview.rootPrefix}
              description="The R2 branch reserved for this app."
            />
            <PreviewTile
              icon={<KeyRoundIcon />}
              title="Auth mode"
              value={preview.authLabel}
              description="Basic Auth is optional and per app."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>What the create flow optimizes for</CardTitle>
              <CardDescription>Get one app online fast, with clean defaults.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
              <p>Paths stay short and memorable.</p>
              <p>Storage prefixes stay isolated and predictable.</p>
              <p>Auth remains explicit instead of silently inherited.</p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New app</CardTitle>
          <CardDescription>Create the route, storage prefix, and optional auth policy in one pass.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="create-name">Display name</FieldLabel>
                <FieldContent>
                  <Input
                    id="create-name"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    placeholder="Notes workspace"
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.slug)}>
                <FieldLabel htmlFor="create-slug">App path</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="create-slug"
                      aria-invalid={Boolean(form.formState.errors.slug)}
                      placeholder="notes"
                      {...form.register("slug")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>/</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>The public WebDAV path segment. Keep it short and stable.</FieldDescription>
                  <FieldError errors={[form.formState.errors.slug]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.rootPrefix)}>
                <FieldLabel htmlFor="create-prefix">Storage prefix</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>R2</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="create-prefix"
                      aria-invalid={Boolean(form.formState.errors.rootPrefix)}
                      placeholder="notes/"
                      {...form.register("rootPrefix")}
                    />
                  </InputGroup>
                  <FieldDescription>The Worker will reserve this branch of the shared bucket for the new app.</FieldDescription>
                  <FieldError errors={[form.formState.errors.rootPrefix]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.notes)}>
                <FieldLabel htmlFor="create-notes">Operational notes</FieldLabel>
                <FieldContent>
                  <InputGroup className="min-h-28 items-stretch">
                    <InputGroupTextarea
                      id="create-notes"
                      className="min-h-28"
                      aria-invalid={Boolean(form.formState.errors.notes)}
                      placeholder="Client, owner, or migration context."
                      {...form.register("notes")}
                    />
                  </InputGroup>
                  <FieldDescription>Optional context for future maintenance.</FieldDescription>
                  <FieldError errors={[form.formState.errors.notes]} />
                </FieldContent>
              </Field>

              <Controller
                control={form.control}
                name="authEnabled"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="create-auth">Enable WebDAV Basic Auth</FieldLabel>
                    <FieldContent>
                      <div className="flex items-center justify-end">
                        <Switch id="create-auth" checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                      <FieldDescription>Add a per-app username and password in front of WebDAV access.</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />

              {form.watch("authEnabled") && (
                <>
                  <Field data-invalid={Boolean(form.formState.errors.authUsername)}>
                    <FieldLabel htmlFor="create-auth-username">Auth username</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-auth-username"
                        aria-invalid={Boolean(form.formState.errors.authUsername)}
                        placeholder="alice"
                        {...form.register("authUsername")}
                      />
                      <FieldError errors={[form.formState.errors.authUsername]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.authPassword)}>
                    <FieldLabel htmlFor="create-auth-password">Auth password</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-auth-password"
                        type="password"
                        aria-invalid={Boolean(form.formState.errors.authPassword)}
                        placeholder="Set the initial WebDAV password"
                        {...form.register("authPassword")}
                      />
                      <FieldDescription>This password is hashed inside the Worker before storage.</FieldDescription>
                      <FieldError errors={[form.formState.errors.authPassword]} />
                    </FieldContent>
                  </Field>
                </>
              )}
            </FieldGroup>

            <Button disabled={submitting} size="lg" type="submit">
              {submitting ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
              Create app
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
