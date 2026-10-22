import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { CropMarks } from "@/components/empty-state";
import { StarterWorld } from "@/features/start/starter-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  elementTypeOrder,
  elementTypes,
  reviewSheet,
  type Element,
  type ElementType,
} from "./model";
import { useElements } from "./store";
import { coverMove, ElementCover, SessionRequired, typeIcons } from "./visuals";
import { CastBoard } from "./state-sheets";

export function ElementIndex() {
  const { status, elements } = useElements();
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Elements"
        description={
          <>
            The cast, places and Things of your world. Establish each one once,
            then mention it anywhere you generate as{" "}
            <span className="font-medium text-tungsten">@Name</span>.
          </>
        }
        actions={
          status === "ready" && elements.length > 0 ? (
            <Button asChild>
              <Link to="/elements/new">
                <Plus aria-hidden="true" /> New Element
              </Link>
            </Button>
          ) : undefined
        }
      />
      {status === "loading" ? (
        <IndexSkeleton />
      ) : status === "signed-out" ? (
        <SessionRequired className="px-0 md:px-0" />
      ) : status === "error" ? (
        <p role="alert" className="mt-10 text-sm text-destructive">
          Your Elements could not be loaded. Reload the page to try again.
        </p>
      ) : elements.length === 0 ? (
        <FirstElement />
      ) : (
        elementTypeOrder.map((type) => (
          <TypeSection
            key={type}
            type={type}
            elements={elements.filter((e) => e.type === type)}
          />
        ))
      )}
    </section>
  );
}

function IndexSkeleton() {
  return (
    <div className="mt-12" aria-busy="true" aria-label="Loading Elements">
      <Skeleton className="h-5 w-32" />
      <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function FirstElement() {
  return (
    <div className="mt-10">
      <div className="relative rounded-sm bg-surface/60 p-6 md:p-8">
        <CropMarks />
        <StarterWorld signedOut={false} className="mx-auto max-w-3xl" />
      </div>
      <h2 className="mt-14 text-lg font-medium">Or start your own</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Most stories begin with someone, somewhere, holding something. Each type
        guides you to the views that keep it recognizable in every shot.
      </p>
      <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {elementTypeOrder.map((type) => {
          const info = elementTypes[type];
          const Icon = typeIcons[type];
          return (
            <li key={type} className="flex flex-col">
              <Icon
                aria-hidden="true"
                className="size-5 text-subtle-foreground"
                strokeWidth={1.5}
              />
              <h3 className="mt-3 text-base font-medium">{info.label}</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">
                {info.establishes}
              </p>
              <Button asChild variant="outline" className="mt-5 w-fit">
                <Link to="/elements/new" search={{ type }}>
                  Create a {info.label}
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TypeSection({
  type,
  elements,
}: {
  type: ElementType;
  elements: Element[];
}) {
  const info = elementTypes[type];
  const headingId = `elements-${type}`;
  return (
    <section className="mt-14" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id={headingId} className="text-lg font-medium">
          {info.plural}
          <span className="tabular ml-2 text-sm font-normal text-muted-foreground">
            {elements.length}
          </span>
        </h2>
        <Link
          to="/elements/new"
          search={{ type }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          New {info.label}
        </Link>
      </div>
      {elements.length === 0 ? (
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          No {info.plural} yet. {info.establishes}
        </p>
      ) : type === "character" ? (
        <CastBoard characters={elements} />
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
          {elements.map((element) => (
            <li key={element.id}>
              <ElementTile element={element} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ElementTile({ element }: { element: Element }) {
  const { coverage } = reviewSheet(element, null);
  const complete = coverage.done === coverage.total;
  return (
    <Link
      to="/elements/$elementId"
      params={{ elementId: element.id }}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <ElementCover
        element={element}
        className="aspect-[4/5] rounded-xl transition-opacity duration-150 group-hover:opacity-85"
      />
      <p className="mt-3 truncate text-sm font-medium">{element.name}</p>
      <p className="mt-0.5 truncate text-xs text-tungsten">@{element.handle}</p>
      <p
        className={
          complete
            ? "tabular mt-1.5 text-xs text-success"
            : "tabular mt-1.5 text-xs text-muted-foreground"
        }
      >
        {complete
          ? "Reference sheet ready"
          : `${coverage.done} of ${coverage.total} essential views`}
        {element.type === "location" && !coverMove(element)
          ? " · no moving reference"
          : ""}
        {element.states.length
          ? ` · ${element.states.length} ${element.states.length === 1 ? "state" : "states"}`
          : ""}
      </p>
    </Link>
  );
}
