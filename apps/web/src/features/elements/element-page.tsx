import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDashed,
  Copy,
  ImagePlus,
  Images,
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
  retagPendingView,
  settlePendingView,
  useJobViews,
  usePendingViews,
  type JobView,
  type PendingView,
} from "./generate";
import {
  assetUrl,
  elementTypes,
  guessView,
  reviewSheet,
  stateHandle,
  type Element,
  type ElementReference,
  type ElementState,
  type GuidanceSlot,
  type ReferenceView,
} from "./model";
import {
  addReference,
  addState,
  deleteElement,
  removeReference,
  removeState,
  updateIdentity,
  updateReference,
  useElement,
} from "./store";
import { MediaPicker, uploadFiles, type AssetRef } from "@/features/library";
import { ConfirmDelete } from "./confirm-delete";
import { SessionRequired, typeIcons } from "./visuals";

export function ElementPage({
  elementId,
  stateHandle: selected,
  notice,
}: {
  elementId: string;
  stateHandle?: string | undefined;
  notice?: string | undefined;
}) {
  const { status, element } = useElement(elementId);
  if (status === "loading") return <PageSkeleton />;
  if (status === "signed-out") return <SessionRequired />;
  if (!element)
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16 md:px-12">
        <h1 className="text-2xl font-semibold">This Element is not here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or it belongs to another session.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/elements">Back to Elements</Link>
        </Button>
      </section>
    );
  const state = selected
    ? (element.states.find((s) => stateHandle(s) === selected) ?? null)
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
  element: Element;
  state: ElementState | null;
  notice?: string | undefined;
}) {
  const info = elementTypes[element.type];
  const Icon = typeIcons[element.type];
  const { jobs, ready } = useJobViews();
  const pending = usePendingViews(element.id).filter(
    (p) => p.stateId === (state?.id ?? null),
  );
  const review = reviewSheet(element, state?.id ?? null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState(notice ?? "");

  async function generate(slots: GuidanceSlot[], key: string) {
    if (generating || !slots.length) return;
    setGenerating(key);
    setError("");
    try {
      await generateViews(element, slots, state, ready);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The view could not be generated.",
      );
    } finally {
      setGenerating(null);
    }
  }
  const complementary = state
    ? info.slots.filter((s) => s.required).slice(0, 1)
    : nextSlots(element, review.missingRequired, 1);

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
            pending={pending}
            jobs={jobs}
            onError={setError}
          />
        </div>
        <aside
          aria-label="Reference guidance"
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <h2 className="text-base font-medium">
            {state ? `${state.name} views` : "Reference guidance"}
          </h2>
          {state ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Show this state from the views where it matters. Identity
              references still apply when you mention{" "}
              <span className="font-medium text-foreground">
                @{element.handle}:{stateHandle(state)}
              </span>
              .
            </p>
          ) : (
            <p className="tabular mt-1 text-sm leading-6 text-muted-foreground">
              {review.coverage.done === review.coverage.total
                ? `All ${review.coverage.total} essential views approved.`
                : `${review.coverage.done} of ${review.coverage.total} essential views approved.`}
            </p>
          )}
          <ol className="mt-4">
            {review.slots.map(({ slot, approved, exploring }) => {
              const done = approved.length > 0;
              const waiting =
                exploring + pending.filter((p) => p.view === slot.id).length;
              return (
                <li key={slot.id} className="flex items-start gap-3 py-2">
                  {done ? (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                  ) : (
                    <CircleDashed
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-subtle-foreground"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {slot.label}
                      <span className="sr-only">
                        {done ? ", approved" : ", missing"}
                      </span>
                      {!slot.required && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {done
                        ? `${approved.length} approved`
                        : waiting
                          ? `${waiting} to review`
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
            disabled={!!generating || !complementary.length}
            onClick={() => void generate(complementary, "complementary")}
          >
            <Sparkles aria-hidden="true" />
            {generating ? "Starting…" : "Generate a complementary view"}
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {complementary[0]
              ? `Next: ${complementary[0].label.toLowerCase()}${state ? ` while ${state.name.toLowerCase()}` : ""}. `
              : ""}
            FLUX 3 Image · uses your Comfy Router credits.
          </p>
        </aside>
      </div>
      {!state && <DeleteElement element={element} />}
    </section>
  );
}

function Identity({ element, icon }: { element: Element; icon: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const info = elementTypes[element.type];

  if (editing)
    return (
      <form
        className="elements-panel mt-6 max-w-3xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          setSaving(true);
          updateIdentity(element.id, { name, description })
            .then(() => setEditing(false))
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "Could not save."),
            )
            .finally(() => setSaving(false));
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
            className="mt-2 w-full resize-y rounded-xl border border-input bg-transparent p-4 text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save identity"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditing(false)}
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
        className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance"
      >
        {element.name}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-tungsten outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`@${element.handle}`)
              .then(() => setCopied(true));
          }}
          onBlur={() => setCopied(false)}
        >
          @{element.handle}
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5 opacity-70" />
          )}
          <span className="sr-only" role="status">
            {copied ? "Mention copied" : "Copy mention"}
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
      <p className="mt-4 text-[0.9375rem] leading-7 text-muted-foreground">
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
  element: Element;
  state: ElementState | null;
}) {
  const [adding, setAdding] = useState(false);
  const tab =
    "inline-flex h-8 items-center rounded-full px-3.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const active = "bg-primary text-primary-foreground";
  const idle =
    "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground";
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
          className={cn(tab, !state ? active : idle)}
        >
          Identity
        </Link>
        {element.states.map((s) => (
          <Link
            key={s.id}
            to="/elements/$elementId"
            params={{ elementId: element.id }}
            search={{ state: stateHandle(s) }}
            aria-current={state?.id === s.id ? "page" : undefined}
            className={cn(tab, state?.id === s.id ? active : idle)}
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
            "gap-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
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
  element: Element;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const info = elementTypes[element.type];
  return (
    <form
      className="elements-panel mt-5 max-w-2xl space-y-4 rounded-xl bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setSaving(true);
        const trimmed = name.trim();
        addState({ elementId: element.id, name: trimmed, description })
          .then(() => {
            onDone();
            return navigate({
              to: "/elements/$elementId",
              params: { elementId: element.id },
              search: { state: stateHandle({ name: trimmed }) },
            });
          })
          .catch((e: unknown) => {
            setError(
              e instanceof Error ? e.message : "Could not add the state.",
            );
            setSaving(false);
          });
      }}
    >
      <div>
        <h2 className="text-sm font-medium">New state</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          A state changes how {element.name} appears without changing who or
          what it is. It gets its own references; identity stays as approved.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {info.stateExamples
          .filter((example) => !element.states.some((s) => s.name === example))
          .map((example) => (
            <button
              key={example}
              type="button"
              aria-pressed={name === example}
              onClick={() => setName(example)}
              className="rounded-full border border-border px-3 py-1 text-xs transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"
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
          className="mt-2"
        />
        {name.trim() && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Mention it as @{element.handle}:{stateHandle({ name })}
          </p>
        )}
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
          placeholder="Optional. A wide warm smile, eyes creased, relaxed shoulders."
          className="mt-2 w-full resize-y rounded-lg border border-input bg-transparent p-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "Adding…" : "Add state"}
        </Button>
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
  element: Element;
  state: ElementState;
}) {
  const navigate = useNavigate();
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-tungsten">
          @{element.handle}:{stateHandle(state)}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {state.description ||
            `How ${element.name} looks when ${state.name.toLowerCase()}.`}
        </p>
      </div>
      <ConfirmDelete
        label="Remove state"
        title={`Remove ${state.name}?`}
        confirmLabel="Remove state"
        onConfirm={() =>
          removeState(state.id).then(() =>
            navigate({
              to: "/elements/$elementId",
              params: { elementId: element.id },
              search: {},
            }),
          )
        }
      >
        Its own references leave the sheet and @{element.handle}:
        {stateHandle(state)} stops resolving. {element.name}&rsquo;s identity is
        unchanged.
      </ConfirmDelete>
    </div>
  );
}

function ReferenceSheet({
  element,
  state,
  pending,
  jobs,
  onError,
}: {
  element: Element;
  state: ElementState | null;
  pending: PendingView[];
  jobs: ReadonlyMap<string, JobView>;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const stateId = state?.id ?? null;
  const references = element.references.filter((r) => r.stateId === stateId);
  const approved = references.filter((r) => r.status === "approved");
  const experiments = references.filter((r) => r.status === "experiment");
  const rejected = references.filter((r) => r.status === "rejected");
  const reviewCount = experiments.length + pending.length;

  const [picking, setPicking] = useState(false);
  async function attach(items: { ref: AssetRef; title: string }[]) {
    for (const item of items) {
      const view = guessView(element.type, item.title);
      await addReference({
        elementId: element.id,
        ...(stateId ? { stateId } : {}),
        asset: item.ref,
        status: "experiment",
        ...(view ? { view } : {}),
      }).catch((e: unknown) =>
        onError(
          e instanceof Error ? e.message : "The image could not be added.",
        ),
      );
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setUploading((n) => n + list.length);
    try {
      const items = await uploadFiles(list);
      if (items.some((item) => !item))
        onError(
          "Some images could not be uploaded. Retry them from your Library.",
        );
      await attach(items.flatMap((item) => (item ? [item] : [])));
    } finally {
      setUploading((n) => n - list.length);
    }
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="approved-heading">
        <h2 id="approved-heading" className="text-base font-medium">
          Approved references
          <span className="tabular ml-2 text-sm font-normal text-muted-foreground">
            {approved.length}
          </span>
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {state
            ? `These define ${element.name} when ${state.name.toLowerCase()}.`
            : `These define ${element.name} wherever it is mentioned.`}
        </p>
        {approved.length ? (
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {approved.map((reference) => (
              <li key={reference.id}>
                <SavedReference element={element} reference={reference} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm leading-6 text-muted-foreground">
            Approve explorations that look right and they collect here.
          </p>
        )}
      </section>

      <section aria-labelledby="explorations-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="explorations-heading" className="text-base font-medium">
            Explorations
            <span className="tabular ml-2 text-sm font-normal text-muted-foreground">
              {reviewCount}
            </span>
          </h2>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setPicking(true)}
            >
              <Images aria-hidden="true" /> From Library
            </Button>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <ImagePlus aria-hidden="true" className="size-4" />
              {uploading ? `Uploading ${uploading}…` : "Upload images"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <MediaPicker
            open={picking}
            onOpenChange={setPicking}
            kind="image"
            title={`Add to ${element.name}${state ? ` · ${state.name}` : ""}`}
            description="Pick an image you uploaded or generated. It joins the explorations for you to review."
            onSelect={(item) => void attach([item])}
          />
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Candidates to approve or reject. They never shape a generation until
          approved.
        </p>
        {reviewCount ? (
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {pending.map((view) => (
              <li key={view.jobId}>
                <PendingReference
                  element={element}
                  view={view}
                  job={jobs.get(view.jobId) ?? null}
                  onError={onError}
                />
              </li>
            ))}
            {experiments.map((reference) => (
              <li key={reference.id}>
                <SavedReference element={element} reference={reference} />
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
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {rejected.length} rejected{" "}
            {rejected.length === 1 ? "reference" : "references"}
          </summary>
          <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {rejected.map((reference) => (
              <li key={reference.id}>
                <SavedReference
                  element={element}
                  reference={reference}
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

function ViewSelect({
  element,
  id,
  value,
  onChange,
  warn,
}: {
  element: Element;
  id: string;
  value: ReferenceView | null;
  onChange: (view: ReferenceView | null) => void;
  warn: boolean;
}) {
  const slots = elementTypes[element.type].slots;
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        What this reference shows
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) =>
          onChange((event.target.value || null) as ReferenceView | null)
        }
        className={cn(
          "w-full truncate rounded-md border-0 bg-transparent py-1 pr-6 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          warn && "text-warning",
        )}
      >
        <option value="">Tag the view…</option>
        {slots.map((slot) => (
          <option key={slot.id} value={slot.id}>
            {slot.label}
          </option>
        ))}
      </select>
    </>
  );
}

function slotLabel(element: Element, view: ReferenceView | null) {
  return (
    elementTypes[element.type].slots.find((s) => s.id === view)?.label ??
    "Untagged reference"
  );
}

function SavedReference({
  element,
  reference,
  compact = false,
}: {
  element: Element;
  reference: ElementReference;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const label = slotLabel(element, reference.view);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const set = (patch: {
    status?: ElementReference["status"];
    view?: ReferenceView | null;
  }) => run(() => updateReference({ id: reference.id, ...patch }));

  return (
    <figure aria-busy={busy}>
      <div className="aspect-square overflow-hidden rounded-xl bg-secondary">
        <img
          src={assetUrl(reference.asset)}
          alt={`${element.name}, ${label.toLowerCase()}`}
          loading="lazy"
          decoding="async"
          className="reference-reveal size-full object-cover"
        />
      </div>
      {!compact && (
        <figcaption className="mt-2">
          <ViewSelect
            element={element}
            id={`view-${reference.id}`}
            value={reference.view}
            onChange={(view) => set({ view })}
            warn={!reference.view && reference.status === "approved"}
          />
          <p className="truncate text-xs text-muted-foreground">
            {reference.asset.type === "media-asset" ? "Uploaded" : "Generated"}
          </p>
        </figcaption>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {reference.status === "experiment" && (
          <>
            <Button
              size="xs"
              disabled={busy}
              onClick={() => set({ status: "approved" })}
              aria-label={`Approve ${label.toLowerCase()}`}
            >
              <Check aria-hidden="true" /> Approve
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => set({ status: "rejected" })}
            >
              Reject
            </Button>
          </>
        )}
        {reference.status === "approved" && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => set({ status: "experiment" })}
          >
            Move to explorations
          </Button>
        )}
        {reference.status === "rejected" && (
          <>
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => set({ status: "experiment" })}
            >
              Restore
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              aria-label="Delete permanently"
              onClick={() => run(() => removeReference(reference.id))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </figure>
  );
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

/** A generated view waiting for its image, or for the creator's decision. */
function PendingReference({
  element,
  view,
  job,
  onError,
}: {
  element: Element;
  view: PendingView;
  job: JobView | null;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const label = slotLabel(element, view.view);
  const output = job?.output ?? null;
  const failed = !!job && !job.active && !output;

  async function decide(status: "approved" | "rejected") {
    if (!output) return;
    setBusy(true);
    try {
      await addReference({
        elementId: element.id,
        ...(view.stateId ? { stateId: view.stateId } : {}),
        asset: {
          type: "job-output",
          jobId: output.jobId,
          outputId: output.outputId,
        },
        status,
        view: view.view,
      });
      settlePendingView(view.jobId);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save this view.");
      setBusy(false);
    }
  }

  return (
    <figure aria-busy={busy}>
      <div className="aspect-square overflow-hidden rounded-xl bg-secondary">
        {output ? (
          <img
            src={output.url}
            alt={`${element.name}, ${label.toLowerCase()}`}
            decoding="async"
            className="reference-reveal size-full object-cover"
          />
        ) : failed ? (
          <div className="flex size-full flex-col justify-end gap-1 p-3">
            <span className="text-xs font-medium text-destructive">
              {jobLabels[job.state] ?? "Unavailable"}
            </span>
            <span className="line-clamp-3 text-xs text-muted-foreground">
              {job.error ?? "This view could not be generated."}
            </span>
          </div>
        ) : (
          <div
            className="reference-pending flex size-full items-end p-3"
            role="status"
          >
            <span className="tabular rounded-full bg-elevated/90 px-2.5 py-1 text-xs font-medium">
              {job
                ? (jobLabels[job.state] ?? "Generating")
                : "Waiting for status"}
              {job?.progress != null && job.active
                ? ` · ${Math.round(job.progress * 100)}%`
                : ""}
            </span>
          </div>
        )}
      </div>
      <figcaption className="mt-2">
        <ViewSelect
          element={element}
          id={`view-${view.jobId}`}
          value={view.view}
          onChange={(next) => next && retagPendingView(view.jobId, next)}
          warn={false}
        />
        <p className="truncate text-xs text-muted-foreground">
          {output ? "Generated · not saved yet" : "Generating"}
        </p>
      </figcaption>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {failed ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => settlePendingView(view.jobId)}
          >
            Dismiss
          </Button>
        ) : (
          <>
            <Button
              size="xs"
              disabled={!output || busy}
              onClick={() => void decide("approved")}
              aria-label={`Approve ${label.toLowerCase()}`}
            >
              <Check aria-hidden="true" /> Approve
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!output || busy}
              onClick={() => void decide("rejected")}
            >
              Reject
            </Button>
          </>
        )}
      </div>
    </figure>
  );
}

function DeleteElement({ element }: { element: Element }) {
  const navigate = useNavigate();
  return (
    <div className="mt-20 border-t border-border pt-6">
      <ConfirmDelete
        label={`Delete ${element.name}`}
        title={`Delete ${element.name}?`}
        confirmLabel="Delete Element"
        onConfirm={() =>
          deleteElement(element.id).then(() => navigate({ to: "/elements" }))
        }
      >
        Its reference sheet and states are removed and mentions of @
        {element.handle} stop resolving. Uploaded and generated images stay in
        your Library.
      </ConfirmDelete>
    </div>
  );
}
