import type { ReactNode } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { FolderKanbanIcon, LayoutGridIcon, PencilRulerIcon } from "lucide-react"

import { useI18n } from "@/lib/i18n"
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
  const { text } = useI18n()
  const location = useLocation()
  const securedApps = apps.filter((app) => app.authEnabled).length

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip={text("Dashboard", "控制台")}>
                <Link to="/">
                  <FolderKanbanIcon />
                  <span>{text("WebDAV Console", "WebDAV 控制台")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{text("Navigate", "导航")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/"} tooltip={text("Overview", "概览")}>
                    <NavLink to="/">
                      <LayoutGridIcon />
                      <span>{text("Overview", "概览")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{apps.length}</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/create"} tooltip={text("Create app", "创建应用")}>
                    <NavLink to="/create">
                      <PencilRulerIcon />
                      <span>{text("New app", "新建应用")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>{text("Current state", "当前状态")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-3 px-2 py-1 text-sm text-sidebar-foreground/80">
                <div className="flex items-center justify-between gap-3">
                  <span>{text("Apps", "应用数")}</span>
                  <Badge variant="secondary">{apps.length}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{text("Basic Auth", "Basic Auth")}</span>
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
