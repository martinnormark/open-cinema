import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/media-url";
import {
  stateHandle,
  stateSheets,
  type Element,
  type ElementReference,
  type ElementState,
  type StateSheet,
} from "./model";

function Frame({
  reference,
  alt,
  missing,
  className,
}: {
  reference: ElementReference | null;
  alt: string;
  missing: string;
  className: string;
}) {
  return reference ? (
    <img
      src={assetUrl(reference.asset)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("rounded-md bg-secondary object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed border-border px-2 text-center text-caption leading-4 text-subtle-foreground",
        className,
      )}
    >
      {missing}
    </span>
  );
}

function lookName(state: ElementState | null) {
  return state ? state.name : "Identity";
}

/**
 * One look of a Character, as a model sees it: the three-panel sheet with the
 * close portrait and the smile beside it.
 */
function SheetStrip({ element, row }: { element: Element; row: StateSheet }) {
  const name = lookName(row.state);
  return (
    <span className="flex items-stretch gap-2">
      <Frame
        reference={row.sheet}
        alt={`${element.name}, ${name.toLowerCase()} character sheet`}
        missing="No sheet yet"
        className="aspect-[21/9] h-16 sm:h-20"
      />
      <Frame
        reference={row.portrait}
        alt={`${element.name}, ${name.toLowerCase()} close portrait`}
        missing="Portrait"
        className="aspect-[3/4] h-16 sm:h-20"
      />
      <Frame
        reference={row.smile}
        alt={`${element.name}, ${name.toLowerCase()} smiling`}
        missing="Smile"
        className="aspect-[3/4] h-16 sm:h-20"
      />
    </span>
  );
}

/** Every look the Character has in the film, each its own sheet. */
export function CharacterLooks({
  element,
  current,
}: {
  element: Element;
  current: ElementState | null;
}) {
  const rows = stateSheets(element);
  return (
    <section aria-labelledby="looks-heading" className="mb-12">
      <h2 id="looks-heading" className="text-base font-medium">
        Sheets by state
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        One sheet per look {element.name} has in the film. A wet or injured{" "}
        {element.name} is a state of its own, not a note on the identity sheet.
      </p>
      <ol className="mt-4 divide-y divide-border border-y border-border">
        {rows.map((row) => {
          const active = (row.state?.id ?? null) === (current?.id ?? null);
          return (
            <li key={row.state?.id ?? "identity"}>
              <Link
                to="/elements/$elementId"
                params={{ elementId: element.id }}
                search={row.state ? { state: stateHandle(row.state) } : {}}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-3 outline-none transition-colors duration-150 hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-surface",
                )}
              >
                <span className="w-28 shrink-0">
                  <span className="block text-sm font-medium">
                    {lookName(row.state)}
                  </span>
                  <span className="block truncate text-xs text-tungsten">
                    @{element.handle}
                    {row.state ? `:${stateHandle(row.state)}` : ""}
                  </span>
                </span>
                <SheetStrip element={element} row={row} />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The cast laid out like a production board: a column per Character, its
 * looks stacked in film order.
 */
export function CastBoard({ characters }: { characters: Element[] }) {
  return (
    <ul
      className="mt-5 flex snap-x gap-8 overflow-x-auto pb-4"
      aria-label="Characters and their sheets"
    >
      {characters.map((element) => (
        <li key={element.id} className="w-56 shrink-0 snap-start sm:w-64">
          <Link
            to="/elements/$elementId"
            params={{ elementId: element.id }}
            className="block rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate text-base font-medium">
              {element.name}
            </span>
            <span className="block truncate text-xs text-tungsten">
              @{element.handle}
            </span>
          </Link>
          <ol className="mt-4 space-y-4">
            {stateSheets(element).map((row) => {
              const name = lookName(row.state);
              const image = row.sheet ?? row.portrait;
              return (
                <li key={row.state?.id ?? "identity"}>
                  <Link
                    to="/elements/$elementId"
                    params={{ elementId: element.id }}
                    search={row.state ? { state: stateHandle(row.state) } : {}}
                    className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                  >
                    <Frame
                      reference={image}
                      alt={`${element.name}, ${name.toLowerCase()}`}
                      missing="No sheet yet"
                      className={cn(
                        "aspect-[21/9] w-full transition-opacity duration-150 group-hover:opacity-85",
                        image && "block",
                        !row.sheet && row.portrait && "object-contain",
                      )}
                    />
                    <span className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground group-hover:text-foreground">
                        {name}
                      </span>
                      {!row.sheet && (
                        <span className="shrink-0 text-subtle-foreground">
                          {row.portrait ? "Portrait only" : "Not started"}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ul>
  );
}
