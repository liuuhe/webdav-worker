import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangleIcon, KeyRoundIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { deleteApp, getApp, updateApp } from "@/lib/api"
import { editAppSchema } from "@/lib/schemas"
import { resolveErrorMessage, useI18n } from "@/lib/i18n"
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

type EditValues = z.infer<ReturnType<typeof editAppSchema>>

type EditAppPageProps = {
  appId: string
  csrfToken: string
  onUpdated: (app: PublicApp) => void
  onDeleted: (appId: string) => void
}

export function EditAppPage({ appId, csrfToken, onUpdated, onDeleted }: EditAppPageProps) {
  const { locale, text } = useI18n()
  const [app, setApp] = useState<PublicApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [purgeData, setPurgeData] = useState(false)
  const schema = useMemo(() => editAppSchema(locale), [locale])
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
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
      toast.error(resolveErrorMessage(error, text, "Unable to load the app."))
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
      toast.success(text("App updated.", "应用已更新。"))
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to save changes."))
    } finally {
      setSaving(false)
    }
  }

  async function removeApp() {
    setDeleting(true)
    try {
      await deleteApp(appId, { purgeData }, csrfToken)
      toast.success(text("App deleted.", "应用已删除。"))
      onDeleted(appId)
    } catch (error) {
      toast.error(resolveErrorMessage(error, text, "Unable to delete the app."))
    } finally {
      setDeleting(false)
    }
  }

  const summary = useMemo(() => {
    const values = form.getValues()
      return {
        path: values.slug.trim() ? `/${values.slug.trim().toLowerCase()}/` : "/your-app/",
        prefix: values.rootPrefix.trim() ? normalizePrefix(values.rootPrefix) : "your-prefix/",
        auth: values.authEnabled ? values.authUsername.trim() || text("Enabled", "已启用") : text("Disabled", "已禁用"),
      }
  }, [form.watch(), text])

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
            <CardTitle>{text("App not found", "未找到应用")}</CardTitle>
            <CardDescription>{text("The requested app could not be loaded from the admin API.", "无法从后台 API 加载该应用。")}</CardDescription>
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
                  <span>{text("Basic Auth", "Basic Auth")}</span>
                </Badge>
              ) : (
                <Badge variant="outline">{text("Open", "开放")}</Badge>
              )}
            </div>
            <CardDescription>
              {text(
                "Editing is intentionally a workspace, not a create dialog. Review identity, access policy, and destructive actions independently.",
                "编辑页是工作区而不是创建弹窗，请分别审查身份、访问策略和危险操作。",
              )}
            </CardDescription>
          </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(save)}>
            <Tabs defaultValue="identity" className="flex flex-col gap-6">
              <TabsList>
                <TabsTrigger value="identity">{text("Identity", "基本信息")}</TabsTrigger>
                <TabsTrigger value="access">{text("Access", "访问控制")}</TabsTrigger>
                <TabsTrigger value="danger">{text("Danger zone", "危险操作")}</TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="flex flex-col gap-6">
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.name)}>
                    <FieldLabel htmlFor="edit-name">{text("Display name", "显示名称")}</FieldLabel>
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
                    <FieldLabel htmlFor="edit-slug">{text("App path", "应用路径")}</FieldLabel>
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
                      <FieldDescription>{text("Clients will notice this change immediately, so avoid casual path renames.", "客户端会立即感知路径变更，请避免随意修改。")}</FieldDescription>
                      <FieldError errors={[form.formState.errors.slug]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.rootPrefix)}>
                    <FieldLabel htmlFor="edit-prefix">{text("Storage prefix", "存储前缀")}</FieldLabel>
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
                      <FieldDescription>{text("Changing this does not move old objects automatically. Treat it as a routing decision.", "修改该值不会自动迁移旧对象，请将其视为路由层决策。")}</FieldDescription>
                      <FieldError errors={[form.formState.errors.rootPrefix]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(form.formState.errors.notes)}>
                    <FieldLabel htmlFor="edit-notes">{text("Operational notes", "运维备注")}</FieldLabel>
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
                        <FieldLabel htmlFor="edit-auth">{text("Enable WebDAV Basic Auth", "启用 WebDAV Basic Auth")}</FieldLabel>
                        <FieldContent>
                          <div className="flex items-center justify-end">
                            <Switch id="edit-auth" checked={field.value} onCheckedChange={field.onChange} />
                          </div>
                          <FieldDescription>{text("Disable this to remove per-app WebDAV credentials. Keep it enabled to preserve the username and current password hash.", "关闭后将移除该应用的 WebDAV 凭据。保持开启则保留用户名与当前密码哈希。")}</FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />

                  {form.watch("authEnabled") && (
                    <>
                      <Field data-invalid={Boolean(form.formState.errors.authUsername)}>
                        <FieldLabel htmlFor="edit-auth-username">{text("Auth username", "认证用户名")}</FieldLabel>
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
                        <FieldLabel htmlFor="edit-auth-password">{text("New auth password", "新认证密码")}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="edit-auth-password"
                            type="password"
                            aria-invalid={Boolean(form.formState.errors.authPassword)}
                            placeholder={text("Leave blank to keep the current password", "留空以保留当前密码")}
                            {...form.register("authPassword")}
                          />
                          <FieldDescription>{text("Only fill this when you want to rotate the WebDAV password.", "仅在需要轮换 WebDAV 密码时填写。")}</FieldDescription>
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
                        {text("Delete this app", "删除此应用")}
                      </CardTitle>
                      <CardDescription>
                        {text("Removing the app always deletes its manage metadata. You can optionally purge the underlying R2 objects too.", "删除应用会移除后台元数据，你也可以选择同时清理对应的 R2 对象。")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-6">
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="purge-data">{text("Purge stored files", "清理存储文件")}</FieldLabel>
                      <FieldContent>
                        <div className="flex items-center justify-end">
                          <Switch id="purge-data" checked={purgeData} onCheckedChange={setPurgeData} />
                        </div>
                        <FieldDescription>{text("Enable this only when you want the Worker to delete objects under the current storage prefix.", "仅当你希望 Worker 删除当前前缀下对象时才启用。")}</FieldDescription>
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
                          <AlertDialogTitle>{text(`Delete ${app.name}?`, `确认删除 ${app.name}？`)}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {text("The app route and metadata will be removed. ", "应用路由和元数据将被删除。")}
                            {purgeData
                              ? text("Stored files under the current prefix will also be deleted.", "当前前缀下的文件也会被删除。")
                              : text("Stored files will be left in R2.", "存储文件会保留在 R2 中。")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{text("Cancel", "取消")}</AlertDialogCancel>
                          <AlertDialogAction disabled={deleting} onClick={() => void removeApp()}>
                            {deleting ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            {text("Confirm delete", "确认删除")}
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
                {text("Save changes", "保存修改")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{text("Live summary", "实时摘要")}</CardTitle>
            <CardDescription>{text("Review the current route and security posture before saving.", "保存前请检查当前路由与安全状态。")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SummaryRow label={text("Public path", "公网路径")} value={summary.path} />
            <SummaryRow label={text("Storage prefix", "存储前缀")} value={summary.prefix} />
            <SummaryRow label={text("Auth", "认证")} value={summary.auth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{text("Current metadata", "当前元数据")}</CardTitle>
            <CardDescription>{text("Audit timestamps from the Worker API.", "来自 Worker API 的审计时间信息。")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <SummaryRow label={text("Created", "创建时间")} value={formatDate(app.createdAt, locale)} />
            <SummaryRow label={text("Updated", "更新时间")} value={formatDate(app.updatedAt, locale)} />
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

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
