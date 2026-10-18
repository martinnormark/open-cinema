import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { GenerationOrb } from "@/features/generation/orb";
import stylesUrl from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Open Cinema" },
      {
        name: "description",
        content: "Your creative studio for images, films, and reusable worlds.",
      },
    ],
    links: [{ rel: "stylesheet", href: stylesUrl }],
  }),
  shellComponent: RootDocument,
  component: AppLayout,
  notFoundComponent: () => (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
      <h1 id="page-title" className="sr-only">
        Page not found
      </h1>
      <EmptyState
        title="This page is off the reel"
        actions={
          <Button asChild>
            <Link to="/">Back to the start</Link>
          </Button>
        }
      >
        <p>The address may be mistyped, or the page has moved.</p>
      </EmptyState>
    </section>
  ),
  errorComponent: ({ reset }) => (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
      <h1 id="page-title" className="sr-only">
        Something went wrong
      </h1>
      <EmptyState
        title="Something went wrong"
        actions={<Button onClick={reset}>Try again</Button>}
      >
        <p>
          Your generations keep running in the background. Try again, or reload
          the page if this keeps happening.
        </p>
      </EmptyState>
    </section>
  ),
});

function AppLayout() {
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 md:px-4">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>
      </SidebarInset>
      <aside aria-label="Generation activity">
        <GenerationOrb />
      </aside>
    </SidebarProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
