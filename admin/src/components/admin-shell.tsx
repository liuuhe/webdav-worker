import type { ReactNode } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { FolderKanbanIcon, LayoutGridIcon, PencilRulerIcon } from "lucide-react"

import type { PublicApp } from "@/lib/types"
import { AccountSheet } from "@/components/account-sheet"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"

type AdminShellProps = {
  apps: PublicApp[]
  title: string
  description: string
  actions?: ReactNode
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  onLogout: () => Promise<void>
  children: ReactNode
}

export function AdminShell({
  apps,
  title,
  description,
  actions,
  onChangePassword,
  onLogout,
  children,
}: AdminShellProps) {
  const location = useLocation()
  const securedApps = apps.filter((app) => app.authEnabled).length

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Dashboard">
                <Link to="/">
                  <FolderKanbanIcon />
                  <span>WebDAV Console</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/"} tooltip="Overview">
                    <NavLink to="/">
                      <LayoutGridIcon />
                      <span>Overview</span>
                    </NavLink>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{apps.length}</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/create"} tooltip="Create app">
                    <NavLink to="/create">
                      <PencilRulerIcon />
                      <span>New app</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Current state</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-3 px-2 py-1 text-sm text-sidebar-foreground/80">
                <div className="flex items-center justify-between gap-3">
                  <span>Apps</span>
                  <Badge variant="secondary">{apps.length}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Basic Auth</span>
                  <Badge variant="outline">{securedApps}</Badge>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-3 p-2">
            <AccountSheet onChangePassword={onChangePassword} onLogout={onLogout} />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="truncate font-heading text-xl tracking-tight">{title}</h1>
              <p className="truncate text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {actions}
          </div>
        </header>
        <div className="flex flex-1 flex-col px-6 py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
