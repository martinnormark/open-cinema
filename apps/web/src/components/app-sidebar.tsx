"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  FolderOpen,
  Shapes,
  BookOpen,
  Images,
  Activity,
  Settings2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { title: "Studio", to: "/", icon: Clapperboard },
  { title: "Projects", to: "/projects", icon: FolderOpen },
  { title: "Elements", to: "/elements", icon: Shapes },
  { title: "Recipes", to: "/recipes", icon: BookOpen },
  { title: "Library", to: "/library", icon: Images },
  { title: "Activity", to: "/activity", icon: Activity },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" role="complementary" aria-label="Workspace">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Open Cinema">
              <Link to="/" onClick={() => setOpenMobile(false)}>
                <Clapperboard aria-hidden="true" className="size-5" />
                <span className="text-base font-semibold tracking-tight">
                  Open Cinema
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Main navigation">
              <SidebarMenu>
                {navigation.map(({ title, to, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === to}
                      tooltip={title}
                    >
                      <Link
                        to={to}
                        aria-current={pathname === to ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/settings"}
              tooltip="Settings"
            >
              <Link
                to="/settings"
                aria-current={pathname === "/settings" ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <Settings2 aria-hidden="true" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
