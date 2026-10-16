import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDashed,
  Copy,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  generateViews,
  nextSlots,
  useJobViews,
  type JobView,
} from "./generate";
import {
  elementTypes,
  referenceImageUrl,
  reviewSheet,
  type CreativeElement,
  type ElementReference,
  type ElementState,
  type GuidanceSlot,
} from "./model";
import {
  addReferences,
  addState,
  deleteElement,
  removeReference,
  removeState,
  updateIdentity,
  updateReference,
  useElement,
} from "./store";
import { ACCEPTED_IMAGES, readReferenceImage } from "./upload";
import { typeIcons } from "./visuals";

export function ElementPage({
  elementId,
  stateHandle,
  notice,
}: {
  elementId: string;
  stateHandle?: string | undefined;
  notice?: string | undefined;
}) {
  const { status, element } = useElement(elementId);
  if (status === "loading") return <PageSkeleton />;
  if (!element)
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16 md:px-12">
        <h1 className="text-2xl font-semibold">This Element is not here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or it was created in another browser.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/elements">Back to Elements</Link>
        </Button>
      </section>
    );
  const state = stateHandle
    ? (element.states.find((s) => s.handle === stateHandle) ?? null)
    : null;
  return <ElementWorkspace element={element} state={state} notice={notice} />;
}

function PageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-6 pt-10 md:px-12"
      aria-busy="true"
      aria-label="Loading Element"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-6 h-9 w-56" />
      <Skeleton className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ElementWorkspace({
  element,
  state,
  notice,
}: {
  element: CreativeElement;
  state: ElementState | null;
  notice?: string | undefined;
}) {
  const info = elementTypes[element.type];
  const Icon = typeIcons[element.type];
  const jobs = useJobViews();
  const review = reviewSheet(element, state?.id ?? null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState(notice ?? "");

  async function generate(slots: GuidanceSlot[], key: string) {
    if (generating || !slots.length) return;
    setGenerating(key);
    setError("");
    try {
      await generateViews(element, slots, state, jobs.ready);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The view could not be generated.",
      );
    } finally {
      setGenerating(null);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-12"
      aria-labelledby="page-title"
    >
      <Link
        to="/elements"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Elements
      </Link>
      <Identity
        element={element}
        icon={<Icon aria-hidden="true" className="size-4" />}
      />
      <SheetTabs element={element} state={state} />

      {error && (
        <p
          role="alert"
          className="mt-6 max-w-3xl text-sm leading-6 text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {state && <StateHeader element={element} state={state} />}
          <ReferenceSheet
            element={element}
            state={state}
            jobs={jobs.jobs}
            outputs={jobs.outputs}
            onError={setError}
          />
        </div>
        <aside
          aria-label="Reference guidance"
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <h2 className="text-base font-medium">
            {state ? `${state.name} references` : "Reference guidance"}
          </h2>
          {state ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Show this state from the views where it matters. Identity
              references still apply when you mention{" "}
              <span className="font-medium text-foreground">
                @{element.handle}:{state.handle}
              </span>
              .
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-muted-foreground tabular-nums">
              {review.coverage.done === review.coverage.total
                ? `All ${review.coverage.total} essential views approved.`
                : `${review.coverage.done} of ${review.coverage.total} essential views approved.`}
            </p>
          )}
          <ol className="mt-5 space-y-1">
            {review.slots.map(({ slot, approved, exploring }) => {
              const done = approved.length > 0;
              return (
                <li
                  key={slot.id}
                  className="flex items-start gap-3 rounded-lg py-2"
                >
                  {done ? (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                  ) : (
                    <CircleDashed
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {slot.label}
                      {!slot.required && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {done
                        ? `${approved.length} approved`
                        : exploring
                          ? `${exploring} to review`
                          : slot.hint}
                    </p>
                  </div>
                  {!done && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!!generating}
                      aria-label={`Generate ${slot.label.toLowerCase()}`}
                      title={`Generate ${slot.label.toLowerCase()}`}
                      onClick={() => void generate([slot], slot.id)}
                    >
                      <Sparkles aria-hidden="true" />
                    </Button>
                  )}
                  <span className="sr-only">{done ? "Done" : "Missing"}</span>
                </li>
              );
            })}
          </ol>
          {review.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-4 flex gap-2 rounded-lg bg-warning/10 p-3 text-xs leading-5 text-warning"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {warning}
            </p>
          ))}
          <Button
            className="mt-6 w-full"
            disabled={!!generating}
            onClick={() =>
              void generate(
                state
                  ? info.slots.filter((s) => s.required).slice(0, 1)
                  : nextSlots(element, review.missingRequired, 1),
                "complementary",
              )
            }
          >
            <Sparkles aria-hidden="true" />
            {generating ? "Starting…" : "Generate a complementary view"}
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {complementaryHint(element, state, review.missingRequired)} FLUX 3
            Image · uses your Comfy Router credits.
          </p>
        </aside>
      </div>
      {!state && <DeleteElement element={element} />}
    </section>
  );
}

function complementaryHint(
  element: CreativeElement,
  state: ElementState | null,
  missing: GuidanceSlot[],
) {
  if (state) return `Adds a ${state.name.toLowerCase()} view to explore.`;
  const [slot] = nextSlots(element, missing, 1);
  return slot ? `Next up: ${slot.label.toLowerCase()}.` : "";
}

function Identity({
  element,
  icon,
}: {
  element: CreativeElement;
  icon: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const info = elementTypes[element.type];

  if (editing)
    return (
      <form
        className="elements-panel mt-6 max-w-3xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          updateIdentity(element.id, { name, description })
            .then(() => setEditing(false))
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "Could not save."),
            );
        }}
      >
        <div>
          <label htmlFor="identity-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="identity-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            className="mt-2 h-11 text-base"
          />
        </div>
        <div>
          <label htmlFor="identity-description" className="text-sm font-medium">
            What makes it recognizable
          </label>
          <textarea
            id="identity-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={1200}
            className="mt-2 w-full resize-y rounded-xl border border-input bg-background p-4 text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">Save identity</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setName(element.name);
              setDescription(element.description);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );

  return (
    <header className="mt-6 max-w-3xl">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {info.label}
      </p>
      <h1
        id="page-title"
        className="mt-2 text-3xl font-semibold tracking-tight text-balance"
      >
        {element.name}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`@${element.handle}`)
              .then(() => setCopied(true));
          }}
          onBlur={() => setCopied(false)}
        >
          @{element.handle}
          {copied ? (
            <Check aria-hidden="true" className="size-3.5 text-success" />
          ) : (
            <Copy
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          )}
          <span className="sr-only" role="status">
            {copied ? "Copied" : "Copy mention"}
          </span>
        </button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => {
            setName(element.name);
            setDescription(element.description);
            setError("");
            setEditing(true);
          }}
        >
          Edit identity
        </button>
      </div>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        {element.description ||
          "No description yet. Describe what should stay the same in every shot."}
      </p>
    </header>
  );
}

function SheetTabs({
  element,
  state,
}: {
  element: CreativeElement;
  state: ElementState | null;
}) {
  const [adding, setAdding] = useState(false);
  const tab =
    "inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="mt-10 border-b border-border pb-4">
      <nav
        aria-label="Reference sheets"
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          to="/elements/$elementId"
          params={{ elementId: element.id }}
          search={{}}
          aria-current={!state ? "page" : undefined}
          className={cn(
            tab,
            !state
              ? "bg-foreground text-background"
              : "bg-secondary hover:bg-secondary/70",
          )}
        >
          Identity
        </Link>
        {element.states.map((s) => (
          <Link
            key={s.id}
            to="/elements/$elementId"
            params={{ elementId: element.id }}
            search={{ state: s.handle }}
            aria-current={state?.id === s.id ? "page" : undefined}
            className={cn(
              tab,
              state?.id === s.id
                ? "bg-foreground text-background"
                : "bg-secondary hover:bg-secondary/70",
            )}
          >
            {s.name}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
          className={cn(
            tab,
            "gap-1.5 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
          )}
        >
          <Plus aria-hidden="true" className="size-4" /> Add state
        </button>
      </nav>
      {adding && (
        <StateForm element={element} onDone={() => setAdding(false)} />
      )}
    </div>
  );
}

function StateForm({
  element,
  onDone,
}: {
  element: CreativeElement;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const info = elementTypes[element.type];
  return (
    <form
      className="elements-panel mt-5 max-w-2xl space-y-4 rounded-xl bg-secondary/50 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        addState(element.id, { name, description })
          .then((created) => {
            onDone();
            return navigate({
              to: "/elements/$elementId",
              params: { elementId: element.id },
              search: { state: created.handle },
            });
          })
          .catch((e: unknown) =>
            setError(
              e instanceof Error ? e.message : "Could not add the state.",
            ),
          );
      }}
    >
      <div>
        <h2 className="text-sm font-medium">New state</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          A state changes how {element.name} appears without changing who or
          what it is. It gets its own references.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {info.stateExamples
          .filter((example) => !element.states.some((s) => s.name === example))
          .map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setName(example)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs transition-colors duration-150 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              {example}
            </button>
          ))}
      </div>
      <div>
        <label htmlFor="state-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="state-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          required
          autoFocus
          className="mt-2 bg-background"
        />
      </div>
      <div>
        <label htmlFor="state-description" className="text-sm font-medium">
          How it looks in this state
        </label>
        <textarea
          id="state-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={600}
          placeholder="Optional, e.g. a wide warm smile, eyes creased, relaxed shoulders"
          className="mt-2 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Add state</Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StateHeader({
  element,
  state,
}: {
  element: CreativeElement;
  state: ElementState;
}) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-sm font-medium">
          @{element.handle}:{state.handle}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {state.description ||
            `How ${element.name} looks when ${state.name.toLowerCase()}.`}
        </p>
      </div>
      <Button
        variant={confirm ? "destructive" : "ghost"}
        size="sm"
        onBlur={() => setConfirm(false)}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          void removeState(element.id, state.id).then(() =>
            navigate({
              to: "/elements/$elementId",
              params: { elementId: element.id },
              search: {},
            }),
          );
        }}
      >
        <Trash2 aria-hidden="true" />
        {confirm ? "Remove state and its references" : "Remove state"}
      </Button>
    </div>
  );
}

function ReferenceSheet({
  element,
  state,
  jobs,
  outputs,
  onError,
}: {
  element: CreativeElement;
  state: ElementState | null;
  jobs: ReadonlyMap<string, JobView>;
  outputs: ReadonlyMap<string, string>;
  onError: (message: string) => void;
}) {
  const stateId = state?.id ?? null;
  const references = element.references.filter((r) => r.stateId === stateId);
  const approved = references.filter((r) => r.status === "approved");
  const explorations = references.filter((r) => r.status === "exploration");
  const rejected = references.filter((r) => r.status === "rejected");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const added: { url: string; fileName: string }[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push({
          url: await readReferenceImage(file),
          fileName: file.name,
        });
      } catch (e) {
        onError(
          e instanceof Error ? e.message : "That file could not be used.",
        );
      }
    }
    if (added.length)
      await addReferences(
        element.id,
        added.map((a) => ({
          source: { kind: "upload", ...a },
          view: null,
          stateId,
        })),
      ).catch((e: unknown) =>
        onError(e instanceof Error ? e.message : "Could not add the images."),
      );
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="approved-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="approved-heading" className="text-base font-medium">
            Approved references
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {approved.length}
            </span>
          </h2>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {state
            ? `These define ${element.name} when ${state.name.toLowerCase()}.`
            : `These define ${element.name} wherever it is mentioned.`}
        </p>
        {approved.length ? (
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {approved.map((reference) => (
              <li key={reference.id}>
                <ReferenceCard
                  element={element}
                  reference={reference}
                  job={jobView(reference, jobs)}
                  url={referenceImageUrl(reference, outputs)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm leading-6 text-muted-foreground">
            Approve explorations that look right and they will collect here.
          </p>
        )}
      </section>

      <section aria-labelledby="explorations-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="explorations-heading" className="text-base font-medium">
            Explorations
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {explorations.length}
            </span>
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <ImagePlus aria-hidden="true" className="size-4" />
            Upload images
            <input
              type="file"
              accept={ACCEPTED_IMAGES}
              multiple
              className="sr-only"
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Candidates to approve or reject. They never affect generations until
          approved.
        </p>
        {explorations.length ? (
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {explorations.map((reference) => (
              <li key={reference.id}>
                <ReferenceCard
                  element={element}
                  reference={reference}
                  job={jobView(reference, jobs)}
                  url={referenceImageUrl(reference, outputs)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Nothing to review. Upload images or generate a view from the
            guidance.
          </p>
        )}
      </section>

      {rejected.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {rejected.length} rejected{" "}
            {rejected.length === 1 ? "reference" : "references"}
          </summary>
          <ul className="mt-5 grid grid-cols-3 gap-3 opacity-80 sm:grid-cols-4 xl:grid-cols-6">
            {rejected.map((reference) => (
              <li key={reference.id}>
                <ReferenceCard
                  element={element}
                  reference={reference}
                  job={jobView(reference, jobs)}
                  url={referenceImageUrl(reference, outputs)}
                  compact
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function jobView(
  reference: ElementReference,
  jobs: ReadonlyMap<string, JobView>,
): JobView | null {
  return reference.source.kind === "generated"
    ? (jobs.get(reference.source.jobId) ?? null)
    : null;
}

const jobLabels: Partial<Record<JobView["state"], string>> = {
  queued: "Queued",
  submitting: "Submitting",
  running: "Generating",
  persisting: "Saving",
  cancelling: "Cancelling",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_attention: "Needs attention",
};

function ReferenceCard({
  element,
  reference,
  job,
  url,
  compact = false,
}: {
  element: CreativeElement;
  reference: ElementReference;
  job: JobView | null;
  url: string | null;
  compact?: boolean;
}) {
  const slots = elementTypes[element.type].slots;
  const view = slots.find((s) => s.id === reference.view);
  const generated = reference.source.kind === "generated";
  const pending = generated && !url && (!job || job.active);
  const failed = generated && !url && !!job && !job.active;
  const description = view ? view.label : "Untagged reference";
  const set = (patch: Partial<Pick<ElementReference, "status" | "view">>) =>
    void updateReference(element.id, reference.id, patch);

  return (
    <figure className="group/card">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
        {url ? (
          <img
            src={url}
            alt={`${element.name}, ${description.toLowerCase()}`}
            loading="lazy"
            decoding="async"
            className="reference-reveal size-full object-cover"
          />
        ) : pending ? (
          <div
            className="reference-pending flex size-full items-end p-3"
            role="status"
          >
            <span className="rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums">
              {job ? jobLabels[job.state] : "Waiting for status"}
              {job?.progress != null && job.active
                ? ` · ${Math.round(job.progress * 100)}%`
                : ""}
            </span>
          </div>
        ) : (
          <div className="flex size-full flex-col justify-end gap-1 p-3">
            <span className="text-xs font-medium text-destructive">
              {failed ? jobLabels[job!.state] : "Image unavailable"}
            </span>
            <span className="line-clamp-3 text-xs text-muted-foreground">
              {failed
                ? (job!.error ?? "This view could not be generated.")
                : "Its generation session is no longer available."}
            </span>
          </div>
        )}
      </div>
      {!compact && (
        <figcaption className="mt-2">
          <label className="sr-only" htmlFor={`view-${reference.id}`}>
            What this reference shows
          </label>
          <select
            id={`view-${reference.id}`}
            value={reference.view ?? ""}
            onChange={(event) => set({ view: event.target.value || null })}
            className={cn(
              "w-full truncate rounded-md border-0 bg-transparent py-1 pr-6 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !view && reference.status === "approved" && "text-warning",
            )}
          >
            <option value="">Tag the view…</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </select>
          <p className="truncate text-xs text-muted-foreground">
            {reference.source.kind === "upload"
              ? `Uploaded · ${reference.source.fileName}`
              : "Generated"}
          </p>
        </figcaption>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {reference.status === "exploration" && (
          <>
            <Button
              size="xs"
              disabled={!url}
              onClick={() => set({ status: "approved" })}
              aria-label={`Approve ${description.toLowerCase()}`}
            >
              <Check aria-hidden="true" /> Approve
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                failed
                  ? void removeReference(element.id, reference.id)
                  : set({ status: "rejected" })
              }
            >
              {failed ? "Remove" : "Reject"}
            </Button>
          </>
        )}
        {reference.status === "approved" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => set({ status: "exploration" })}
          >
            Unapprove
          </Button>
        )}
        {reference.status === "rejected" && (
          <>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => set({ status: "exploration" })}
            >
              Restore
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Delete permanently"
              onClick={() => void removeReference(element.id, reference.id)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </figure>
  );
}

function DeleteElement({ element }: { element: CreativeElement }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-20 border-t border-border pt-6">
      <Button
        variant={confirm ? "destructive" : "ghost"}
        size="sm"
        onBlur={() => setConfirm(false)}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          void deleteElement(element.id).then(() =>
            navigate({ to: "/elements" }),
          );
        }}
      >
        <Trash2 aria-hidden="true" />
        {confirm
          ? `Delete ${element.name} and its references`
          : `Delete ${element.name}`}
      </Button>
      {confirm && (
        <p className="mt-2 text-xs text-muted-foreground">
          Mentions of @{element.handle} will stop resolving. Generated images
          stay in your Library.
        </p>
      )}
    </div>
  );
}
