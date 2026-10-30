"use client";
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Folder,
  PackageOpen,
  Clapperboard,
  Film,
  House,
  Images,
  Menu,
  Settings2,
  Shapes,
} from "lucide-react";
import type { ReplacementKind } from "@/features/revision/model";
import { GOAL_ICONS } from "@/features/start/goal-icons";
import { takeGoals } from "@/features/start/goals";
import { BrandLockup } from "@/components/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const groups = [
  {
    title: "Create",
    items: [
      {
        title: "Studio",
        to: "/studio",
        icon: Clapperboard,
        description: "Create images and video",
      },
      {
        title: "Sequences",
        to: "/sequences",
        icon: Film,
        description: "Plan and direct your shots",
      },
      {
        title: "Recipes",
        to: "/recipes",
        icon: BookOpen,
        description: "Reuse a creative direction",
      },
    ],
  },
  {
    title: "Revise",
    items: takeGoals.map((goal) => ({
      title: goal.title,
      to: "/revisions/new",
      icon: GOAL_ICONS[goal.id],
      description: goal.promise,
      kind: goal.kind,
    })),
  },
  {
    title: "World",
    items: [
      {
        title: "Elements",
        to: "/elements",
        icon: Shapes,
        description: "Your cast, places and Things",
      },
      {
        title: "Library",
        to: "/library",
        icon: Images,
        description: "Uploads and generated media",
      },
      {
        title: "Projects",
        to: "/projects",
        icon: Folder,
        description: "A shared direction for your shots",
      },
      {
        title: "Move your world",
        to: "/world",
        icon: PackageOpen,
        description: "Save or bring in a creative world",
      },
    ],
  },
];
const settings = {
  title: "Settings",
  to: "/settings",
  icon: Settings2,
  description: "Connections and preferences",
};
type Destination = (typeof groups)[number]["items"][number];

export function AppTopBar() {
  const [open, setOpen] = useState(false);
  const location = useRouterState({ select: (s) => s.location });
  const search = location.search as {
    kind?: ReplacementKind;
    source?: string;
    project?: string;
  };
  const isRevision = location.pathname.startsWith("/revisions/");
  const current = (item: Destination) =>
    "kind" in item
      ? isRevision &&
        location.pathname === "/revisions/new" &&
        (search.kind ?? "background") === item.kind
      : location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`);
  const group =
    groups.find((g) => g.items.some(current)) ??
    (isRevision ? groups[1] : undefined);
  const page =
    group?.items.find(current)?.title ??
    (isRevision
      ? "Revision"
      : location.pathname === "/settings"
        ? "Settings"
        : "Start");
  const destination = (item: Destination) => ({
    to: item.to,
    ...("kind" in item
      ? {
          search: {
            kind: item.kind,
            ...(isRevision && search.source ? { source: search.source } : {}),
            ...(isRevision && search.project
              ? { project: search.project }
              : {}),
          },
        }
      : {}),
  });
  const row = (item: Destination) => (
    <Link
      {...destination(item)}
      aria-current={current(item) ? "page" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-md px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        current(item)
          ? "bg-hover text-foreground"
          : "text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
      onClick={() => setOpen(false)}
    >
      <item.icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          current(item) && "text-tungsten",
        )}
      />
      <span>
        <span className="block text-sm font-medium">{item.title}</span>
        <span className="block text-xs leading-5 text-muted-foreground">
          {item.description}
        </span>
      </span>
    </Link>
  );
  return (
    <>
      <header className="studio-header flex h-14 shrink-0 items-center gap-4 border-b border-border px-3 md:px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            aria-label="Open navigation"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-80 overflow-y-auto bg-sidebar p-4"
          >
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Explore your creative workspace</SheetDescription>
            <nav aria-label="Workspace" className="space-y-4">
              {row({
                title: "Start",
                to: "/",
                icon: House,
                description: "Choose what to make",
              })}
              {groups.map((g) => (
                <details key={`${g.title}-${group?.title}`} open={group === g}>
                  <summary
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-3 text-label outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      group === g ? "text-tungsten" : "text-muted-foreground",
                    )}
                  >
                    {g.title}
                  </summary>
                  {g.items.map((item) => (
                    <div key={item.title}>{row(item)}</div>
                  ))}
                </details>
              ))}
              {row(settings)}
            </nav>
          </SheetContent>
        </Sheet>
        <Link
          to="/"
          aria-label="Open Cinema"
          className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLockup className="text-lg" />
        </Link>
        <nav
          ref={followCurrent}
          aria-label="Main navigation"
          className="topbar-nav relative hidden h-full flex-1 items-center gap-3 md:flex"
        >
          <span aria-hidden="true" className="topbar-lamp" />
          {groups.map((g) => (
            <DropdownMenu key={g.title} modal={false}>
              <DropdownMenuTrigger
                data-current={group === g || undefined}
                aria-current={group === g ? "true" : undefined}
                className="topbar-link gap-2"
              >
                {g.title}
                <ChevronDown
                  aria-hidden="true"
                  className="topbar-chevron size-3.5"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                {g.items.map((item) => (
                  <DropdownMenuItem key={item.title} asChild className="p-0">
                    {row(item)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <Link
            to="/settings"
            data-current={page === "Settings" || undefined}
            aria-current={page === "Settings" ? "page" : undefined}
            className="topbar-link ml-auto gap-2"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            Settings
          </Link>
        </nav>
      </header>
      <nav
        aria-label="Current location"
        className="flex min-h-10 items-center gap-2 border-b border-border px-6 text-label md:px-12"
      >
        {group && (
          <>
            <span className="text-muted-foreground">{group.title}</span>
            <ChevronRight
              aria-hidden="true"
              className="size-3 text-subtle-foreground"
            />
          </>
        )}
        <span aria-current="page" className="text-foreground">
          {page}
        </span>
      </nav>
    </>
  );
}

function placeLamp(nav: HTMLElement, glide: boolean) {
  const lamp = nav.querySelector<HTMLElement>(".topbar-lamp");
  if (!lamp) return;
  // Area triggers stay selected while any of their child routes are open.
  const current = [...nav.querySelectorAll<HTMLElement>("[data-current]")].find(
    (el) => el.offsetWidth > 0,
  );
  if (!current) {
    delete lamp.dataset.placed;
    return;
  }
  const inset = 8;
  const snap = !glide || !lamp.dataset.placed;
  if (snap) lamp.style.transition = "none";
  lamp.style.transform = `translateX(${current.offsetLeft + inset}px) scaleX(${Math.max(1, current.offsetWidth - inset * 2)})`;
  if (snap) {
    void lamp.offsetWidth;
    lamp.style.transition = "";
  }
  lamp.dataset.placed = "true";
}
function followCurrent(nav: HTMLElement | null) {
  if (!nav || typeof ResizeObserver === "undefined") return;
  placeLamp(nav, false);
  const resized = new ResizeObserver(() => placeLamp(nav, false));
  resized.observe(nav);
  const moved = new MutationObserver(() => placeLamp(nav, true));
  moved.observe(nav, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-current"],
  });
  return () => {
    resized.disconnect();
    moved.disconnect();
  };
}
