import { Link } from "react-router-dom"
import { ArrowRightIcon, KeyRoundIcon, Link2Icon, PlusIcon } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import type { PublicApp } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type DashboardPageProps = {
  apps: PublicApp[]
  loading: boolean
}

export function DashboardPage({ apps, loading }: DashboardPageProps) {
  const { locale, text } = useI18n()
  const securedApps = apps.filter((app) => app.authEnabled).length

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden">
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col gap-4">
              <Badge variant="secondary" className="w-fit">{text("Control plane ready", "控制平面已就绪")}</Badge>
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-3xl tracking-tight">{text("No apps yet. Start with a clean path and storage prefix.", "暂无应用。请先从清晰的路径和存储前缀开始。")}</h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  {text("Each app becomes a stable WebDAV endpoint like ", "每个应用都会成为稳定的 WebDAV 端点，例如 ")}
                  <code>/notes/</code>
                  {text(", mapped to its own R2 prefix and optional Basic Auth policy.", "，并映射到独立 R2 前缀与可选 Basic Auth 策略。")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/create">
                    <PlusIcon data-icon="inline-start" />
                    {text("Create the first app", "创建第一个应用")}
                  </Link>
                </Button>
              </div>
            </div>
            <Card className="bg-muted/40">
              <CardHeader>
                <CardTitle>{text("Recommended baseline", "推荐基线配置")}</CardTitle>
                <CardDescription>{text("Good defaults for the first app.", "适用于首个应用的默认建议。")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  {text("Use a short public path like ", "使用简短公网路径，例如 ")}
                  <code>notes</code>
                  {text(".", "。")}
                </p>
                <p>
                  {text("Match the storage prefix to the public path, for example ", "存储前缀建议与公网路径一致，例如 ")}
                  <code>notes/</code>
                  {text(".", "。")}
                </p>
                <p>{text("Only enable Basic Auth when the client or environment needs a second credential wall.", "仅在客户端或环境确实需要第二层凭据保护时启用 Basic Auth。")}</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2Icon />
            </EmptyMedia>
            <EmptyTitle>{text("No routed apps", "暂无路由应用")}</EmptyTitle>
            <EmptyDescription>{text("Create the first app to unlock file sync, locks, and per-path isolation.", "创建第一个应用后即可启用文件同步、锁和路径隔离。")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/create">
                <PlusIcon data-icon="inline-start" />
                {text("Open the create flow", "进入创建流程")}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          title={text("Managed apps", "管理中的应用")}
          value={String(apps.length)}
          description={text("Distinct public WebDAV paths currently mapped into the bucket.", "当前映射到 Bucket 的独立公网 WebDAV 路径数量。")}
        />
        <MetricCard
          title={text("Auth-enabled apps", "启用认证的应用")}
          value={String(securedApps)}
          description={text("Apps currently guarded by per-app WebDAV Basic Auth.", "当前启用每应用 WebDAV Basic Auth 保护的应用数量。")}
        />
        <MetricCard
          title={text("Open apps", "开放应用")}
          value={String(apps.length - securedApps)}
          description={text("Apps that rely only on the admin console for management access.", "仅通过后台管理控制访问策略的应用数量。")}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{text("Apps at a glance", "应用概览")}</CardTitle>
            <CardDescription>{text("Scan paths, storage prefixes, auth state, and jump into the dedicated edit workspace.", "查看路径、存储前缀和认证状态，并进入专用编辑工作区。")}</CardDescription>
          </div>
          <Button asChild>
            <Link to="/create">
              <PlusIcon data-icon="inline-start" />
              {text("New app", "新建应用")}
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text("App", "应用")}</TableHead>
                <TableHead>{text("Path", "路径")}</TableHead>
                <TableHead>{text("Storage", "存储")}</TableHead>
                <TableHead>{text("Auth", "认证")}</TableHead>
                <TableHead className="text-right">{text("Action", "操作")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((app) => (
                <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{app.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {text("Updated ", "更新时间 ")}
                          {formatDate(app.updatedAt, locale)}
                        </span>
                      </div>
                    </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <code>{`/${app.slug}/`}</code>
                      <a className="text-xs text-muted-foreground underline-offset-4 hover:underline" href={app.accessUrl}>
                        {app.accessUrl}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell><code>{app.rootPrefix}</code></TableCell>
                    <TableCell>
                      {app.authEnabled ? (
                        <Badge variant="secondary">
                          <KeyRoundIcon />
                          <span>{app.authUsername || text("Enabled", "已启用")}</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline">{text("Open", "开放")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost">
                        <Link to={`/apps/${app.id}`}>
                          {text("Edit", "编辑")}
                          <ArrowRightIcon data-icon="inline-end" />
                        </Link>
                      </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle>{text("Storage discipline", "存储规范")}</CardTitle>
                <CardDescription>{text("Each app should own a unique prefix.", "每个应用都应使用唯一前缀。")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                {text(
                  "Keep prefixes human-readable and avoid reusing the same branch for unrelated apps. The manage console enforces uniqueness, but naming discipline still makes future cleanup easier.",
                  "建议保持前缀可读，并避免无关应用复用同一前缀。虽然控制台会强制唯一性，但良好命名仍有助于后续清理。",
                )}
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle>{text("Auth policy", "认证策略")}</CardTitle>
                <CardDescription>{text("Use auth only when the client really needs it.", "仅在客户端确实需要时启用认证。")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                {text(
                  "Basic Auth adds another credential layer, but it also adds PBKDF2 verification cost on each request. Favor app isolation first, auth second.",
                  "Basic Auth 提供额外凭据保护，但也会增加每次请求的 PBKDF2 校验开销。建议优先做应用隔离，其次再考虑认证。",
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="font-heading text-4xl tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-7 text-muted-foreground">{description}</CardContent>
    </Card>
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
