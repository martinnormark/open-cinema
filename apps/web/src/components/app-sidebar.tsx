"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  FolderOpen,
  Film,
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
import { BrandMark } from "@/components/brand-mark";

const navigation = [
  { title: "Studio", to: "/", icon: Clapperboard },
  { title: "Projects", to: "/projects", icon: FolderOpen },
  { title: "Sequences", to: "/sequences", icon: Film },
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
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Open Cinema">
              <Link to="/" onClick={() => setOpenMobile(false)}>
                <BrandMark className="size-5 shrink-0" />
                <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
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
                {navigation.map(({ title, to, icon: Icon }) => {
                  const active =
                    pathname === to ||
                    (to !== "/" && pathname.startsWith(`${to}/`));
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={title}
                      >
                        <Link
                          to={to}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
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
