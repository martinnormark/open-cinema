"use client";

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
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
import { takeGoals, type TakeGoal } from "@/features/start/goals";
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

// Pages folded out of the nav light up the item they now open from.
const makers = [
  { title: "Studio", to: "/studio", icon: Clapperboard, also: "/recipes" },
  { title: "Sequences", to: "/sequences", icon: Film, also: "/projects" },
] as const;
const shelves = [
  { title: "Elements", to: "/elements", icon: Shapes },
  { title: "Library", to: "/library", icon: Images },
] as const;
const everyPlace = [
  { title: "Start", to: "/", icon: House },
  ...makers,
  ...shelves,
  { title: "Settings", to: "/settings", icon: Settings2 },
] as const;

/** Take goals shown inline from `lg`; the rest wait under "More" until `xl`. */
const INLINE_AT_LG = 5;
const INLINE_AT_XL = 8;
const inline = takeGoals.filter((g) => !("more" in g && g.more));
const folded = takeGoals.filter((g) => "more" in g && g.more);

function useLocation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) =>
      s.location.search as {
        kind?: ReplacementKind;
        source?: string;
        project?: string;
      },
  });
  const under = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
  const onTask = pathname === "/revisions/new";
  return {
    pathname,
    /** The take goal open in the revision studio, if any. */
    task: onTask ? (search.kind ?? "background") : null,
    isPlace: (to: string, also?: string) =>
      to === "/" ? pathname === "/" : under(to) || (!!also && under(also)),
    /** Moving between tasks keeps the take and project already chosen. */
    taskSearch: (kind: ReplacementKind) => ({
      kind,
      ...(onTask && search.source ? { source: search.source } : {}),
      ...(onTask && search.project ? { project: search.project } : {}),
    }),
  };
}

/**
 * The app's top bar: the lockup, the things you make, every way to change a
 * take, then the shelves. Below `lg` the places fold into a sheet and the
 * tasks become a strip of chips under the bar.
 */
export function AppTopBar() {
  const location = useLocation();
  return (
    <>
      <header className="studio-header flex h-14 shrink-0 items-center gap-1 border-b border-border px-3 md:px-4">
        <PlacesSheet location={location} />
        <Link
          to="/"
          aria-label="Open Cinema"
          aria-current={location.pathname === "/" ? "page" : undefined}
          className="mr-3 shrink-0 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:mr-4"
        >
          <BrandLockup className="text-lg" />
        </Link>
        <nav
          ref={followCurrent}
          aria-label="Main navigation"
          className="topbar-nav relative hidden h-full min-w-0 flex-1 items-center lg:flex"
        >
          <span aria-hidden="true" className="topbar-lamp" />
          {makers.map((item) => (
            <TopLink
              key={item.to}
              to={item.to}
              current={location.isPlace(item.to, item.also)}
            >
              {item.title}
            </TopLink>
          ))}
          <span aria-hidden="true" className="mx-2 h-4 w-px bg-border" />
          {inline.map((goal, i) => (
            <TopLink
              key={goal.id}
              to="/revisions/new"
              search={location.taskSearch(goal.kind)}
              current={location.task === goal.kind}
              title={goal.title}
              className={cn(
                "topbar-task",
                i >= INLINE_AT_LG && "hidden xl:inline-flex",
              )}
            >
              {goal.short}
            </TopLink>
          ))}
          <MoreTasks location={location} />
          <span className="min-w-4 flex-1" />
          {shelves.map((item) => (
            <TopLink
              key={item.to}
              to={item.to}
              current={location.isPlace(item.to)}
            >
              {item.title}
            </TopLink>
          ))}
          <Link
            to="/settings"
            aria-current={location.isPlace("/settings") ? "page" : undefined}
            data-current={location.isPlace("/settings") || undefined}
            className="topbar-link ml-1 justify-center px-2"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            <span className="sr-only">Settings</span>
          </Link>
        </nav>
      </header>
      <TaskStrip location={location} />
    </>
  );
}

function TopLink({
  to,
  search,
  current,
  title,
  className,
  children,
}: {
  to: string;
  search?: Record<string, string>;
  current: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      {...(search ? { search } : {})}
      {...(title ? { title } : {})}
      aria-current={current ? "page" : undefined}
      data-current={current || undefined}
      className={cn("topbar-link", className)}
    >
      {children}
    </Link>
  );
}

/** Effects, looks and the camera, plus whatever does not fit inline yet. */
function MoreTasks({ location }: { location: ReturnType<typeof useLocation> }) {
  const overflow = inline.slice(INLINE_AT_LG, INLINE_AT_XL);
  const holds = (goal: TakeGoal) => location.task === goal.kind;
  return (
    // Not modal: opening it must not lock scrolling and shift the page.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        data-current={
          folded.some(holds) || overflow.some(holds) ? true : undefined
        }
        className="topbar-link topbar-task gap-1"
      >
        More
        <ChevronDown aria-hidden="true" className="topbar-chevron size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {[...overflow, ...folded].map((goal) => {
          const Icon = GOAL_ICONS[goal.id];
          return (
            <DropdownMenuItem
              key={goal.id}
              asChild
              className={cn(
                "items-start gap-3 py-2",
                overflow.includes(goal) && "xl:hidden",
              )}
            >
              <Link
                to="/revisions/new"
                search={location.taskSearch(goal.kind)}
                aria-current={holds(goal) ? "page" : undefined}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    holds(goal) ? "text-tungsten" : "text-subtle-foreground",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm">{goal.title}</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {goal.promise}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The current item's lamp is one 2px tungsten line that glides along the bar
 * (transitions.dev tabs sliding), riding transform only. It snaps while the bar
 * itself reflows and hides when the current page has no item in the bar.
 */
function placeLamp(nav: HTMLElement, glide: boolean) {
  const lamp = nav.querySelector<HTMLElement>(".topbar-lamp");
  if (!lamp) return;
  // The first one showing: an overflow goal's own link at `xl`, else "More".
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

/** Below `lg`: every place, in a sheet from the left. */
function PlacesSheet({
  location,
}: {
  location: ReturnType<typeof useLocation>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <div className="flex h-14 items-center border-b border-border px-4">
          <SheetTitle asChild>
            <span>
              <BrandLockup className="text-lg" />
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Places in your workspace
          </SheetDescription>
        </div>
        <nav aria-label="Workspace" className="flex flex-col gap-0.5 p-2">
          {everyPlace.map((item) => {
            const current = location.isPlace(
              item.to,
              "also" in item ? item.also : undefined,
            );
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={current ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "bg-hover text-foreground"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    current ? "text-tungsten" : "text-subtle-foreground",
                  )}
                />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Keeps the current chip in view without moving the page. */
function centreChip(chip: HTMLElement | null) {
  const strip = chip?.parentElement?.parentElement;
  if (!chip || !strip) return;
  strip.scrollLeft =
    chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
}

/** Below `lg`: every way to change a take, as a strip of chips. */
function TaskStrip({ location }: { location: ReturnType<typeof useLocation> }) {
  return (
    <nav
      aria-label="Change a take"
      className="topbar-strip overflow-x-auto border-b border-border lg:hidden"
    >
      <ul className="flex w-max gap-1.5 px-3 py-2 md:px-4">
        {takeGoals.map((goal) => {
          const current = location.task === goal.kind;
          const Icon = GOAL_ICONS[goal.id];
          return (
            <li key={goal.id} ref={current ? centreChip : undefined}>
              <Link
                to="/revisions/new"
                search={location.taskSearch(goal.kind)}
                aria-current={current ? "page" : undefined}
                className="topbar-chip"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {goal.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
