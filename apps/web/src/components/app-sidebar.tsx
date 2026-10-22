"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  House,
  Film,
  Shapes,
  Images,
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
import { BrandLockup } from "@/components/brand-mark";

const navigation = [
  { title: "Start", to: "/", icon: House },
  // Pages folded out of the nav light up the item they now open from.
  { title: "Studio", to: "/studio", icon: Clapperboard, also: "/recipes" },
  { title: "Elements", to: "/elements", icon: Shapes },
  { title: "Sequences", to: "/sequences", icon: Film, also: "/projects" },
  { title: "Library", to: "/library", icon: Images },
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
                <BrandLockup className="text-xl" />
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
                {navigation.map((item) => {
                  const { title, to, icon: Icon } = item;
                  const under = (path: string) =>
                    pathname === path || pathname.startsWith(`${path}/`);
                  const active =
                    pathname === to ||
                    (to !== "/" && under(to)) ||
                    ("also" in item && under(item.also));
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
