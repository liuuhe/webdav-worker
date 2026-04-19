import { lazy, startTransition, Suspense, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { ExternalLinkIcon, PlusIcon, RefreshCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { changeAdminPassword, getSessionState, listApps, logoutAdmin } from "@/lib/api"
import type { PublicApp, SessionState } from "@/lib/types"
import { AdminShell } from "@/components/admin-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

const SetupScreen = lazy(async () => ({
  default: (await import("@/components/setup-screen")).SetupScreen,
}))
const LoginScreen = lazy(async () => ({
  default: (await import("@/components/login-screen")).LoginScreen,
}))
const DashboardPage = lazy(async () => ({
  default: (await import("@/components/dashboard-page")).DashboardPage,
}))
const CreateAppPage = lazy(async () => ({
  default: (await import("@/components/create-app-page")).CreateAppPage,
}))
const EditAppPage = lazy(async () => ({
  default: (await import("@/components/edit-app-page")).EditAppPage,
}))

function App() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [apps, setApps] = useState<PublicApp[]>([])
  const [appsLoading, setAppsLoading] = useState(false)

  useEffect(() => {
    void refreshSession()
  }, [])

  useEffect(() => {
    if (!session?.authenticated) {
      startTransition(() => setApps([]))
      setAppsLoading(false)
      return
    }

    let cancelled = false
    setAppsLoading(true)

    void (async () => {
      try {
        const response = await listApps()
        if (cancelled) {
          return
        }
        startTransition(() => setApps(sortApps(response.data.apps)))
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : "Unable to load apps."
        toast.error(message)
      } finally {
        if (!cancelled) {
          setAppsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.authenticated])

  async function refreshSession(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false
    if (!silent) {
      setSessionLoading(true)
    }

    try {
      const response = await getSessionState()
      setSessionError(null)
      startTransition(() => setSession(response.data))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load the admin session."
      setSessionError(message)
    } finally {
      if (!silent) {
        setSessionLoading(false)
      }
    }
  }

  async function refreshApps() {
    if (!session?.authenticated) {
      return
    }

    setAppsLoading(true)
    try {
      const response = await listApps()
      startTransition(() => setApps(sortApps(response.data.apps)))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh apps."
      toast.error(message)
    } finally {
      setAppsLoading(false)
    }
  }

  async function handleLogout() {
    if (!session?.csrfToken) {
      throw new Error("No active admin session.")
    }

    await logoutAdmin(session.csrfToken)
    startTransition(() =>
      setSession({
        authenticated: false,
        adminConfigured: true,
        csrfToken: "",
      }),
    )
    startTransition(() => setApps([]))
  }

  async function handleChangePassword(currentPassword: string, newPassword: string) {
    if (!session?.csrfToken) {
      throw new Error("No active admin session.")
    }

    await changeAdminPassword(currentPassword, newPassword, session.csrfToken)
    await refreshSession({ silent: true })
  }

  function handleCreated(app: PublicApp) {
    startTransition(() => setApps((currentApps) => sortApps([...currentApps, app])))
  }

  function handleUpdated(app: PublicApp) {
    startTransition(() =>
      setApps((currentApps) =>
        sortApps(currentApps.map((currentApp) => (currentApp.id === app.id ? app : currentApp))),
      ),
    )
  }

  function handleDeleted(appId: string) {
    startTransition(() => setApps((currentApps) => currentApps.filter((app) => app.id !== appId)))
  }

  let content: ReactNode

  if (sessionLoading) {
    content = <LoadingScreen />
  } else if (sessionError) {
    content = <FatalScreen message={sessionError} onRetry={() => void refreshSession()} />
  } else if (!session?.adminConfigured) {
    content = (
      <Suspense fallback={<LoadingScreen />}>
        <SetupScreen onConfigured={() => refreshSession()} />
      </Suspense>
    )
  } else if (!session.authenticated) {
    content = (
      <Suspense fallback={<LoadingScreen />}>
        <LoginScreen onAuthenticated={() => refreshSession()} />
      </Suspense>
    )
  } else {
    content = (
      <BrowserRouter basename="/manage">
        <AuthenticatedConsole
          apps={apps}
          appsLoading={appsLoading}
          csrfToken={session.csrfToken}
          onChangePassword={handleChangePassword}
          onCreated={handleCreated}
          onDeleted={handleDeleted}
          onLogout={handleLogout}
          onRefreshApps={refreshApps}
          onUpdated={handleUpdated}
        />
      </BrowserRouter>
    )
  }

  return (
    <TooltipProvider>
      {content}
      <Toaster closeButton position="top-right" richColors />
    </TooltipProvider>
  )
}

type AuthenticatedConsoleProps = {
  apps: PublicApp[]
  appsLoading: boolean
  csrfToken: string
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  onCreated: (app: PublicApp) => void
  onDeleted: (appId: string) => void
  onLogout: () => Promise<void>
  onRefreshApps: () => Promise<void>
  onUpdated: (app: PublicApp) => void
}

function AuthenticatedConsole({
  apps,
  appsLoading,
  csrfToken,
  onChangePassword,
  onCreated,
  onDeleted,
  onLogout,
  onRefreshApps,
  onUpdated,
}: AuthenticatedConsoleProps) {
  const location = useLocation()
  const appIdMatch = location.pathname.match(/^\/apps\/([^/]+)$/)
  const currentApp = appIdMatch ? apps.find((app) => app.id === decodeURIComponent(appIdMatch[1])) ?? null : null

  let title = "Apps overview"
  let description = "Scan paths, auth state, and open a dedicated workspace for changes."
  let actions: ReactNode = (
    <>
      <Button variant="outline" onClick={() => void onRefreshApps()}>
        <RefreshCcwIcon data-icon="inline-start" />
        Refresh
      </Button>
      <Button asChild>
        <Link to="/create">
          <PlusIcon data-icon="inline-start" />
          New app
        </Link>
      </Button>
    </>
  )

  if (location.pathname === "/create") {
    title = "Create a new app"
    description = "Pick the public path and storage prefix first, then decide whether Basic Auth belongs here."
    actions = (
      <Button variant="outline" onClick={() => void onRefreshApps()}>
        <RefreshCcwIcon data-icon="inline-start" />
        Refresh
      </Button>
    )
  } else if (currentApp) {
    title = `Edit ${currentApp.name}`
    description = "Use the dedicated workspace to update identity, auth policy, and destructive operations."
    actions = (
      <>
        <Button variant="outline" onClick={() => void onRefreshApps()}>
          <RefreshCcwIcon data-icon="inline-start" />
          Refresh
        </Button>
        <Button asChild>
          <a href={currentApp.accessUrl} rel="noreferrer" target="_blank">
            <ExternalLinkIcon data-icon="inline-start" />
            Open endpoint
          </a>
        </Button>
      </>
    )
  }

  return (
    <AdminShell
      actions={actions}
      apps={apps}
      description={description}
      onChangePassword={onChangePassword}
      onLogout={onLogout}
      title={title}
    >
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<RouteLoadingState />}>
              <DashboardPage apps={apps} loading={appsLoading} />
            </Suspense>
          }
        />
        <Route path="/create" element={<CreateRoute csrfToken={csrfToken} onCreated={onCreated} />} />
        <Route
          path="/apps/:appId"
          element={<EditRoute csrfToken={csrfToken} onDeleted={onDeleted} onUpdated={onUpdated} />}
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AdminShell>
  )
}

function CreateRoute({
  csrfToken,
  onCreated,
}: {
  csrfToken: string
  onCreated: (app: PublicApp) => void
}) {
  const navigate = useNavigate()

  return (
    <Suspense fallback={<RouteLoadingState />}>
      <CreateAppPage
        csrfToken={csrfToken}
        onCreated={(app) => {
          onCreated(app)
          navigate(`/apps/${app.id}`)
        }}
      />
    </Suspense>
  )
}

function EditRoute({
  csrfToken,
  onDeleted,
  onUpdated,
}: {
  csrfToken: string
  onDeleted: (appId: string) => void
  onUpdated: (app: PublicApp) => void
}) {
  const navigate = useNavigate()
  const { appId } = useParams()

  if (!appId) {
    return <Navigate replace to="/" />
  }

  return (
    <Suspense fallback={<RouteLoadingState />}>
      <EditAppPage
        appId={appId}
        csrfToken={csrfToken}
        onDeleted={(deletedAppId) => {
          onDeleted(deletedAppId)
          navigate("/", { replace: true })
        }}
        onUpdated={onUpdated}
      />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-svh bg-muted/30 px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Loading admin console</CardTitle>
            <CardDescription>Checking session state and preparing the WebDAV control plane.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner data-icon="inline-start" />
            <span>Fetching current admin state.</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function FatalScreen({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="min-h-svh bg-muted/30 px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Unable to load the admin console</CardTitle>
            <CardDescription>The Worker did not return a usable session response.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm leading-7 text-muted-foreground">{message}</p>
            <div className="flex items-center gap-3">
              <Button onClick={onRetry}>
                <RefreshCcwIcon data-icon="inline-start" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function sortApps(apps: PublicApp[]) {
  return [...apps].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name)
    if (nameComparison !== 0) {
      return nameComparison
    }
    return left.slug.localeCompare(right.slug)
  })
}

function RouteLoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading workspace</CardTitle>
        <CardDescription>Fetching the next admin view.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner data-icon="inline-start" />
        <span>Preparing page assets.</span>
      </CardContent>
    </Card>
  )
}

export default App
