import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangleIcon, KeyRoundIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { deleteApp, getApp, updateApp } from "@/lib/api"
import { editAppSchema } from "@/lib/schemas"
import type { AppFormValues, PublicApp } from "@/lib/types"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type EditValues = z.infer<typeof editAppSchema>

type EditAppPageProps = {
  appId: string
  csrfToken: string
  onUpdated: (app: PublicApp) => void
  onDeleted: (appId: string) => void
}

export function EditAppPage({ appId, csrfToken, onUpdated, onDeleted }: EditAppPageProps) {
  const [app, setApp] = useState<PublicApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [purgeData, setPurgeData] = useState(false)
  const form = useForm<EditValues>({
    resolver: zodResolver(editAppSchema),
    defaultValues: emptyForm(),
  })

  useEffect(() => {
    void loadApp()
  }, [appId])

  async function loadApp() {
    setLoading(true)
    try {
      const response = await getApp(appId)
      setApp(response.data.app)
      form.reset(toFormValues(response.data.app))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load the app."
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function save(values: EditValues) {
    setSaving(true)
    try {
      const response = await updateApp(appId, values, csrfToken)
      setApp(response.data.app)
      onUpdated(response.data.app)
      form.reset(toFormValues(response.data.app))
      toast.success("App updated.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save changes."
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function removeApp() {
    setDeleting(true)
    try {
      await deleteApp(appId, { purgeData }, csrfToken)
      toast.success("App deleted.")
      onDeleted(appId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the app."
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  const summary = useMemo(() => {
    const values = form.getValues()
    return {
      path: values.slug.trim() ? `/${values.slug.trim().toLowerCase()}/` : "/your-app/",
      prefix: values.rootPrefix.trim() ? normalizePrefix(values.rootPrefix) : "your-prefix/",
      auth: values.authEnabled ? values.authUsername.trim() || "Enabled" : "Disabled",
    }
  }, [form.watch()])

  if (loading) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!app) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App not found</CardTitle>
          <CardDescription>The requested app could not be loaded from the admin API.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{app.name}</CardTitle>
            <Badge variant="outline">{app.slug}</Badge>
            {form.watch("authEnabled") ? (
              <Badge variant="secondary">
                <KeyRoundIcon />
                <span>Basic Auth</span>
              </Badge>
            ) : (
              <Badge variant="outline">Open</Badge>
            )}
          </div>
          <CardDescription>
            Editing is intentionally a workspace, not a create dialog. Review identity, access policy, and destructive actions independently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(save)}>
            <Tabs defaultValue="identity" className="flex flex-col gap-6">
              <TabsList>
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="access">Access</TabsTrigger>
                <TabsTrigger value="danger">Danger zone</TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="flex flex-col gap-6">
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.name)}>
                    <FieldLabel htmlFor="edit-name">Display name</FieldLabel>
                    <FieldContent>
                      <Input
                        id="edit-name"
                        aria-invalid={Boolean(form.formState.errors.name)}
                        {...form.register("name")}
                      />
                      <FieldError errors={[form.formState.errors.name]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.slug)}>
                    <FieldLabel htmlFor="edit-slug">App path</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>/</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="edit-slug"
                          aria-invalid={Boolean(form.formState.errors.slug)}
                          {...form.register("slug")}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>/</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldDescription>Clients will notice this change immediately, so avoid casual path renames.</FieldDescription>
                      <FieldError errors={[form.formState.errors.slug]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.rootPrefix)}>
                    <FieldLabel htmlFor="edit-prefix">Storage prefix</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>R2</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="edit-prefix"
                          aria-invalid={Boolean(form.formState.errors.rootPrefix)}
                          {...form.register("rootPrefix")}
                        />
                      </InputGroup>
                      <FieldDescription>Changing this does not move old objects automatically. Treat it as a routing decision.</FieldDescription>
                      <FieldError errors={[form.formState.errors.rootPrefix]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.notes)}>
                    <FieldLabel htmlFor="edit-notes">Operational notes</FieldLabel>
                    <FieldContent>
                      <InputGroup className="min-h-32 items-stretch">
                        <InputGroupTextarea
                          id="edit-notes"
                          className="min-h-32"
                          aria-invalid={Boolean(form.formState.errors.notes)}
                          {...form.register("notes")}
                        />
                      </InputGroup>
                      <FieldError errors={[form.formState.errors.notes]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </TabsContent>

              <TabsContent value="access" className="flex flex-col gap-6">
                <FieldGroup>
                  <Controller
                    control={form.control}
                    name="authEnabled"
                    render={({ field }) => (
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="edit-auth">Enable WebDAV Basic Auth</FieldLabel>
                        <FieldContent>
                          <div className="flex items-center justify-end">
                            <Switch id="edit-auth" checked={field.value} onCheckedChange={field.onChange} />
                          </div>
                          <FieldDescription>
                            Disable this to remove per-app WebDAV credentials. Keep it enabled to preserve the username and current password hash.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />

                  {form.watch("authEnabled") && (
                    <>
                      <Field data-invalid={Boolean(form.formState.errors.authUsername)}>
                        <FieldLabel htmlFor="edit-auth-username">Auth username</FieldLabel>
                        <FieldContent>
                          <Input
                            id="edit-auth-username"
                            aria-invalid={Boolean(form.formState.errors.authUsername)}
                            {...form.register("authUsername")}
                          />
                          <FieldError errors={[form.formState.errors.authUsername]} />
                        </FieldContent>
                      </Field>

                      <Field data-invalid={Boolean(form.formState.errors.authPassword)}>
                        <FieldLabel htmlFor="edit-auth-password">New auth password</FieldLabel>
                        <FieldContent>
                          <Input
                            id="edit-auth-password"
                            type="password"
                            aria-invalid={Boolean(form.formState.errors.authPassword)}
                            placeholder="Leave blank to keep the current password"
                            {...form.register("authPassword")}
                          />
                          <FieldDescription>Only fill this when you want to rotate the WebDAV password.</FieldDescription>
                          <FieldError errors={[form.formState.errors.authPassword]} />
                        </FieldContent>
                      </Field>
                    </>
                  )}
                </FieldGroup>
              </TabsContent>

              <TabsContent value="danger" className="flex flex-col gap-6">
                <Card className="border-destructive/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangleIcon />
                      Delete this app
                    </CardTitle>
                    <CardDescription>
                      Removing the app always deletes its manage metadata. You can optionally purge the underlying R2 objects too.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="purge-data">Purge stored files</FieldLabel>
                      <FieldContent>
                        <div className="flex items-center justify-end">
                          <Switch id="purge-data" checked={purgeData} onCheckedChange={setPurgeData} />
                        </div>
                        <FieldDescription>Enable this only when you want the Worker to delete objects under the current storage prefix.</FieldDescription>
                      </FieldContent>
                    </Field>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" type="button">
                          <Trash2Icon data-icon="inline-start" />
                          Delete app
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The app route and metadata will be removed. {purgeData ? "Stored files under the current prefix will also be deleted." : "Stored files will be left in R2."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction disabled={deleting} onClick={() => void removeApp()}>
                            {deleting ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            Confirm delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Separator />

            <div className="flex items-center justify-end gap-3">
              <Button disabled={saving} size="lg" type="submit">
                {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Live summary</CardTitle>
            <CardDescription>Review the current route and security posture before saving.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SummaryRow label="Public path" value={summary.path} />
            <SummaryRow label="Storage prefix" value={summary.prefix} />
            <SummaryRow label="Auth" value={summary.auth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current metadata</CardTitle>
            <CardDescription>Audit timestamps from the Worker API.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <SummaryRow label="Created" value={formatDate(app.createdAt)} />
            <SummaryRow label="Updated" value={formatDate(app.updatedAt)} />
            <SummaryRow label="WebDAV URL" value={app.accessUrl} multiline />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={multiline ? "break-all font-mono text-sm" : "font-mono text-sm"}>{value}</span>
    </div>
  )
}

function toFormValues(app: PublicApp): AppFormValues {
  return {
    name: app.name,
    slug: app.slug,
    rootPrefix: app.rootPrefix,
    notes: app.notes,
    authEnabled: app.authEnabled,
    authUsername: app.authUsername,
    authPassword: "",
  }
}

function emptyForm(): AppFormValues {
  return {
    name: "",
    slug: "",
    rootPrefix: "",
    notes: "",
    authEnabled: false,
    authUsername: "",
    authPassword: "",
  }
}

function normalizePrefix(value: string) {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "")
  return trimmed ? `${trimmed}/` : "your-prefix/"
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
