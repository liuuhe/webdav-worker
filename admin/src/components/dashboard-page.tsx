import { Link } from "react-router-dom"
import { ArrowRightIcon, KeyRoundIcon, Link2Icon, PlusIcon } from "lucide-react"

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
              <Badge variant="secondary" className="w-fit">Control plane ready</Badge>
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-3xl tracking-tight">No apps yet. Start with a clean path and storage prefix.</h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  Each app becomes a stable WebDAV endpoint like <code>/notes/</code>, mapped to its own R2 prefix and optional Basic Auth policy.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/create">
                    <PlusIcon data-icon="inline-start" />
                    Create the first app
                  </Link>
                </Button>
              </div>
            </div>
            <Card className="bg-muted/40">
              <CardHeader>
                <CardTitle>Recommended baseline</CardTitle>
                <CardDescription>Good defaults for the first app.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>Use a short public path like <code>notes</code>.</p>
                <p>Match the storage prefix to the public path, for example <code>notes/</code>.</p>
                <p>Only enable Basic Auth when the client or environment needs a second credential wall.</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2Icon />
            </EmptyMedia>
            <EmptyTitle>No routed apps</EmptyTitle>
            <EmptyDescription>Create the first app to unlock file sync, locks, and per-path isolation.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/create">
                <PlusIcon data-icon="inline-start" />
                Open the create flow
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
          title="Managed apps"
          value={String(apps.length)}
          description="Distinct public WebDAV paths currently mapped into the bucket."
        />
        <MetricCard
          title="Auth-enabled apps"
          value={String(securedApps)}
          description="Apps currently guarded by per-app WebDAV Basic Auth."
        />
        <MetricCard
          title="Open apps"
          value={String(apps.length - securedApps)}
          description="Apps that rely only on the admin console for management access."
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>Apps at a glance</CardTitle>
            <CardDescription>Scan paths, storage prefixes, auth state, and jump into the dedicated edit workspace.</CardDescription>
          </div>
          <Button asChild>
            <Link to="/create">
              <PlusIcon data-icon="inline-start" />
              New app
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{app.name}</span>
                      <span className="text-xs text-muted-foreground">Updated {formatDate(app.updatedAt)}</span>
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
                        <span>{app.authUsername || "Enabled"}</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost">
                      <Link to={`/apps/${app.id}`}>
                        Edit
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
                <CardTitle>Storage discipline</CardTitle>
                <CardDescription>Each app should own a unique prefix.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                Keep prefixes human-readable and avoid reusing the same branch for unrelated apps. The manage console enforces uniqueness, but naming discipline still makes future cleanup easier.
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle>Auth policy</CardTitle>
                <CardDescription>Use auth only when the client really needs it.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                Basic Auth adds another credential layer, but it also adds PBKDF2 verification cost on each request. Favor app isolation first, auth second.
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
