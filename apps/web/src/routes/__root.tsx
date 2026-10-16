import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
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
    <section className="p-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link className="mt-4 inline-block underline" to="/">
        Back to Studio
      </Link>
    </section>
  ),
  errorComponent: ({ reset }) => (
    <section className="p-10">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <button className="mt-4 underline" onClick={reset}>
        Try again
      </button>
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
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">
            Your creative workspace
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Early preview
          </span>
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
