import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobViews } from "./generate";
import {
  elementTypeOrder,
  elementTypes,
  reviewSheet,
  type CreativeElement,
  type ElementType,
} from "./model";
import { useElements } from "./store";
import { ElementCover, typeIcons } from "./visuals";

export function ElementIndex() {
  const { status, elements } = useElements();
  const { outputs } = useJobViews();
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            id="page-title"
            className="text-3xl font-semibold tracking-tight text-balance"
          >
            Elements
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            The cast, places and Things of your world. Establish each one once,
            then mention it anywhere you generate as{" "}
            <span className="font-medium text-foreground">@Name</span>.
          </p>
        </div>
        <Button asChild>
          <Link to="/elements/new">
            <Plus aria-hidden="true" /> New Element
          </Link>
        </Button>
      </div>
      {status === "loading" ? (
        <IndexSkeleton />
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
            outputs={outputs}
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
    <div className="mt-12 border-t border-border pt-8">
      <h2 className="text-lg font-medium">Start your world</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Most stories begin with someone, somewhere, holding something. Pick
        where to begin; each type guides you to the views that make it
        recognizable.
      </p>
      <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {elementTypeOrder.map((type) => {
          const info = elementTypes[type];
          const Icon = typeIcons[type];
          return (
            <li key={type} className="flex flex-col">
              <Icon
                aria-hidden="true"
                className="size-6 text-muted-foreground"
                strokeWidth={1.5}
              />
              <h3 className="mt-4 text-base font-medium">{info.label}</h3>
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
  outputs,
}: {
  type: ElementType;
  elements: CreativeElement[];
  outputs: ReadonlyMap<string, string>;
}) {
  const info = elementTypes[type];
  const headingId = `elements-${type}`;
  return (
    <section className="mt-14" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id={headingId} className="text-lg font-medium">
          {info.plural}
          <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
            {elements.length}
          </span>
        </h2>
        <Link
          to="/elements/new"
          search={{ type }}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          New {info.label}
        </Link>
      </div>
      {elements.length === 0 ? (
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          No {info.plural} yet. {info.establishes}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
          {elements.map((element) => (
            <li key={element.id}>
              <ElementTile element={element} outputs={outputs} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ElementTile({
  element,
  outputs,
}: {
  element: CreativeElement;
  outputs: ReadonlyMap<string, string>;
}) {
  const { coverage } = reviewSheet(element, null);
  const complete = coverage.done === coverage.total;
  return (
    <Link
      to="/elements/$elementId"
      params={{ elementId: element.id }}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
    >
      <ElementCover
        element={element}
        outputs={outputs}
        className="aspect-[4/5] rounded-xl transition-opacity duration-150 group-hover:opacity-90"
      />
      <p className="mt-3 truncate text-sm font-medium">{element.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        @{element.handle}
      </p>
      <p
        className={
          complete
            ? "mt-1.5 text-xs text-success"
            : "mt-1.5 text-xs text-muted-foreground"
        }
      >
        {complete
          ? "Reference sheet ready"
          : `${coverage.done} of ${coverage.total} essential views`}
        {element.states.length
          ? ` · ${element.states.length} ${element.states.length === 1 ? "state" : "states"}`
          : ""}
      </p>
    </Link>
  );
}
