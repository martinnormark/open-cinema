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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATE_KIND_LABELS,
  STATE_KINDS_BY_TYPE,
  stateKindSchema,
  type StateKind,
} from "@open-cinema/contracts";
import { cn } from "@/lib/utils";
import { useCostPreferences } from "@/features/settings/preferences";
import {
  generateViews,
  editCharacterReference,
  retagPendingView,
  settlePendingView,
  useJobViews,
  usePendingViews,
  type JobView,
  type PendingView,
} from "./generate";
import { assetUrl, posterUrl } from "@/lib/media-url";
import {
  defaultView,
  elementTypes,
  guessView,
  isMovingView,
  nextStep,
  replacedBy,
  reviewSheet,
  stateHandle,
  viewLabel,
  type Element,
  type ElementReference,
  type ElementState,
  type GuidanceSlot,
  type ReferenceView,
} from "./model";
import {
  addApprovedReference,
  addReference,
  addState,
  approveReference,
  deleteElement,
  removeReference,
  removeState,
  updateState,
  updateIdentity,
  updateReference,
  useElement,
} from "./store";
import { MediaPicker, uploadFiles, type AssetRef } from "@/features/library";
import { ConfirmDelete } from "./confirm-delete";
import { SessionRequired, typeIcons } from "./visuals";
import { CharacterLooks } from "./state-sheets";
import { MovingReference } from "./moving-reference";
import { mentionOf, NextStepPanel, useInStudio } from "./next-step";
import type { MediaItem } from "@/features/library";

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
      <section className="mx-auto w-full max-w-6xl px-6 pt-8 pb-16 md:px-12 md:pt-12">
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
  const waiting = new Map<ReferenceView, number>();
  for (const { slot, exploring } of review.slots)
    waiting.set(
      slot.id,
      exploring + pending.filter((p) => p.view === slot.id).length,
    );
  const step = nextStep(element, state?.id ?? null, waiting);
  const preferences = useCostPreferences();

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
        // When the sheet is ready, the next step offers it instead.
        offerUse={state !== null || step.kind !== "ready"}
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
          {element.type === "character" && (
            <CharacterLooks element={element} current={state} />
          )}
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
          <h2 className="sr-only">Next step</h2>
          <NextStepPanel
            element={element}
            state={state}
            step={step}
            busy={!!generating}
            preferences={preferences}
            onGenerate={(slots) => void generate(slots, "next")}
          />
          <h2 className="mt-8 flex items-baseline justify-between gap-3 text-sm font-medium">
            {state ? `${state.name} sheet` : "Reference sheet"}
            <span className="tabular text-xs font-normal text-muted-foreground">
              {state && element.type !== "character"
                ? "Shows the change"
                : `${review.coverage.done} of ${review.coverage.total} essential`}
            </span>
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {state && element.type === "character"
              ? "This state is its own sheet. Until it has its own close portrait, the base portrait keeps the face."
              : state
                ? `Show ${state.name.toLowerCase()} in the views where it matters. Identity references fill in the rest when you mention ${mentionOf(element, state)}.`
                : "Each view is made to match the ones already approved."}
          </p>
          {[true, false].map((required) => {
            const rows = review.slots.filter(
              (r) => r.slot.required === required,
            );
            if (!rows.length) return null;
            return (
              <div key={String(required)}>
                {!required && (
                  <h3 className="mt-5 text-xs font-medium text-muted-foreground">
                    Optional views
                  </h3>
                )}
                <ol className={required ? "mt-3" : "mt-1"}>
                  {rows.map(({ slot, approved, exploring }) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      approved={approved.length}
                      waiting={
                        exploring +
                        pending.filter((p) => p.view === slot.id).length
                      }
                      disabled={!!generating}
                      onGenerate={() => void generate([slot], slot.id)}
                    />
                  ))}
                </ol>
              </div>
            );
          })}
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
        </aside>
      </div>
      {!state && <DeleteElement element={element} />}
    </section>
  );
}

function SlotRow({
  slot,
  approved,
  waiting,
  disabled,
  onGenerate,
}: {
  slot: GuidanceSlot;
  approved: number;
  waiting: number;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const done = approved > 0;
  // Celebrate an approval made here, not every view approved before.
  const [doneOnArrival] = useState(done);
  return (
    <li className="flex items-start gap-3 py-2">
      {done ? (
        <Check
          aria-hidden="true"
          className={cn(
            "mt-0.5 size-4 shrink-0 text-success",
            !doneOnArrival && "slot-done",
          )}
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
          <span className="sr-only">{done ? ", approved" : ", missing"}</span>
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {done
            ? `${approved} approved`
            : waiting
              ? `${waiting} to review`
              : slot.hint.replace(/ Make it first[^.]*\./, "")}
        </p>
      </div>
      {!done && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Generate ${slot.label.toLowerCase()}`}
          title={`Generate ${slot.label.toLowerCase()}`}
          onClick={onGenerate}
        >
          <Sparkles aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

function Identity({
  element,
  icon,
  offerUse,
}: {
  element: Element;
  icon: ReactNode;
  offerUse: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const info = elementTypes[element.type];
  const use = useInStudio(element, null);
  const usable =
    offerUse &&
    element.references.some(
      (r) => r.status === "approved" && r.stateId === null,
    );

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
        className="mt-2 text-title font-semibold text-balance"
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
        {usable && (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={use}
          >
            Use in Studio
          </button>
        )}
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
      <p className="mt-4 text-body leading-7 text-muted-foreground">
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
  const [kind, setKind] = useState<StateKind>(
    STATE_KINDS_BY_TYPE[element.type][0].kind,
  );
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
        addState({ elementId: element.id, name: trimmed, description, kind })
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
          .filter(
            (example) => !element.states.some((s) => s.name === example.name),
          )
          .map((example) => (
            <button
              key={example.name}
              type="button"
              aria-pressed={name === example.name}
              onClick={() => {
                setName(example.name);
                setKind(example.kind);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"
            >
              {example.name}
            </button>
          ))}
      </div>
      <StateKindField
        element={element}
        value={kind}
        onChange={setKind}
        id="state-kind"
      />
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
          placeholder={
            element.type === "character"
              ? "What changes, head to toe: hair, skin, marks, every piece of clothing. Soaking wet, hair plastered flat, water dripping from the chin, coat dark and sodden."
              : "Optional. What changes in this state, and where it shows."
          }
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

/**
 * What a state changes. States of different kinds combine in one mention,
 * so naming the kind is what makes wet and frightened possible together.
 */
function StateKindField({
  element,
  value,
  onChange,
  id,
  disabled,
}: {
  element: Element;
  value: StateKind;
  onChange: (kind: StateKind) => void;
  id: string;
  disabled?: boolean;
}) {
  const suggested = STATE_KINDS_BY_TYPE[element.type].map((k) => k.kind);
  const kinds: StateKind[] = [
    ...suggested,
    ...stateKindSchema.options.filter(
      (k) => !(suggested as readonly StateKind[]).includes(k),
    ),
  ];
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        What it changes
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as StateKind)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="mt-2 min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((k) => (
            <SelectItem key={k} value={k}>
              {STATE_KIND_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        States of different kinds combine, one of each: @{element.handle}
        :wet+frightened.
      </p>
    </div>
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
  const [error, setError] = useState("");
  const combinable = element.states.filter(
    (s) => s.id !== state.id && (s.kind === "other" || s.kind !== state.kind),
  );
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
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <Select
            value={state.kind}
            onValueChange={(kind) => {
              setError("");
              updateState({ id: state.id, kind: kind as StateKind }).catch(
                (e: unknown) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not save the state.",
                  ),
              );
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={`What ${state.name} changes`}
              className="min-w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stateKindSchema.options.map((k) => (
                <SelectItem key={k} value={k}>
                  {STATE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {combinable.length > 0 && (
            <span>
              Combines with{" "}
              {combinable.slice(0, 3).map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <code className="font-mono text-foreground">
                    @{element.handle}:{stateHandle(state)}+{stateHandle(s)}
                  </code>
                </span>
              ))}
            </span>
          )}
          {error && (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          )}
        </div>
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
  // A Location also takes clips: its moving references.
  const takesClips = element.type === "location";
  async function attach(items: Pick<MediaItem, "ref" | "title" | "kind">[]) {
    // A file whose name says nothing takes the view the sheet still needs.
    const taken = new Set<ReferenceView>();
    for (const item of items) {
      const view =
        guessView(element.type, item.title, item.kind) ??
        defaultView(element, stateId, item.kind, taken);
      if (view) taken.add(view);
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
    const list = Array.from(files).filter(
      (f) =>
        f.type.startsWith("image/") ||
        (takesClips && f.type.startsWith("video/")),
    );
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

  const approvedSection = (
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
            <li key={reference.id} className={tileClass(reference.view)}>
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
  );
  const explorationsSection = (
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
            {uploading
              ? `Uploading ${uploading}…`
              : takesClips
                ? "Upload images or clips"
                : "Upload images"}
            <input
              type="file"
              accept={
                takesClips
                  ? "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
                  : "image/png,image/jpeg,image/webp"
              }
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
          kind={takesClips ? undefined : "image"}
          title={`Add to ${element.name}${state ? ` · ${state.name}` : ""}`}
          description={
            takesClips
              ? "Pick an image, or a clip of the empty place with the camera moving. It joins the explorations for you to review."
              : "Pick an image you uploaded or generated. It joins the explorations for you to review."
          }
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
            <li key={view.jobId} className={tileClass(view.view)}>
              <PendingReference
                element={element}
                view={view}
                job={jobs.get(view.jobId) ?? null}
                onError={onError}
              />
            </li>
          ))}
          {experiments.map((reference) => (
            <li key={reference.id} className={tileClass(reference.view)}>
              <SavedReference element={element} reference={reference} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Nothing to review. Upload {takesClips ? "images or clips" : "images"}{" "}
          or generate a view from the guidance.
        </p>
      )}
    </section>
  );

  return (
    <div className="space-y-12">
      {/* Until something is approved, the work is in the explorations. */}
      {approved.length ? approvedSection : explorationsSection}
      {approved.length ? explorationsSection : approvedSection}
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
  // A clip is only ever a moving view, and a still never is.
  const slots = elementTypes[element.type].slots.filter(
    (slot) => !!slot.move === isMovingView(value),
  );
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
  return viewLabel(element.type, view);
}

/**
 * A sheet or turnaround is three panels wide, so it takes a whole row of the grid; a moving
 * reference is a 16:9 clip and takes two columns.
 */
function tileClass(view: ReferenceView | null) {
  return view === "sheet" || view === "turnaround"
    ? "col-span-full"
    : isMovingView(view) || (view && WIDE_STILLS.has(view))
      ? "col-span-2"
      : undefined;
}
/** A Location's wide stills are made 16:9, like the shots that use them. */
const WIDE_STILLS: ReadonlySet<ReferenceView> = new Set([
  "establishing",
  "landmark",
  "alternate-angle",
]);
function frameClass(view: ReferenceView | null) {
  return view === "sheet" || view === "turnaround"
    ? "aspect-[21/9]"
    : isMovingView(view) || (view && WIDE_STILLS.has(view))
      ? "aspect-video"
      : "aspect-square";
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
  const replaces = replacedBy(
    element,
    reference.stateId,
    reference.view,
    reference.id,
  );

  return (
    <figure aria-busy={busy}>
      <div
        className={cn(
          "overflow-hidden rounded-xl bg-secondary",
          compact ? "aspect-square" : frameClass(reference.view),
        )}
      >
        {isMovingView(reference.view) ? (
          <MovingReference
            src={assetUrl(reference.asset)}
            poster={posterUrl(reference.asset)}
            label={`${element.name}, ${label.toLowerCase()}`}
          />
        ) : (
          <img
            src={assetUrl(reference.asset)}
            alt={`${element.name}, ${label.toLowerCase()}`}
            loading="lazy"
            decoding="async"
            className="reference-reveal size-full object-cover"
          />
        )}
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
              onClick={() => run(() => approveReference(reference.id))}
              aria-label={`${replaces ? "Use instead of the approved" : "Approve"} ${label.toLowerCase()}`}
              title={
                replaces
                  ? "Replaces the approved one, which returns to the explorations"
                  : undefined
              }
            >
              <Check aria-hidden="true" />{" "}
              {replaces ? "Use instead" : "Approve"}
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
      <CharacterReferenceEdit
        element={element}
        view={reference.view}
        stateId={reference.stateId}
        source={reference.asset}
      />
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
  const replaces = replacedBy(element, view.stateId, view.view);
  async function decide(status: "approved" | "rejected") {
    if (!output) return;
    setBusy(true);
    try {
      const asset: AssetRef = {
        type: "job-output",
        jobId: output.jobId,
        outputId: output.outputId,
      };
      const input = {
        elementId: element.id,
        ...(view.stateId ? { stateId: view.stateId } : {}),
        asset,
        view: view.view,
      };
      await (status === "approved"
        ? addApprovedReference(input)
        : addReference({ ...input, status }));
      settlePendingView(view.jobId);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save this view.");
      setBusy(false);
    }
  }

  const alt = `${element.name}, ${label.toLowerCase()}`;
  return (
    <figure aria-busy={busy}>
      <div
        className={cn(
          "overflow-hidden rounded-xl bg-secondary",
          frameClass(view.view),
        )}
      >
        {output ? (
          output.kind === "video" ? (
            <MovingReference src={output.url} label={alt} />
          ) : (
            <img
              src={output.url}
              alt={alt}
              decoding="async"
              className="reference-reveal size-full object-cover"
            />
          )
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
          <PendingBadge
            text={`${
              job
                ? (jobLabels[job.state] ?? "Generating")
                : "Waiting for status"
            }${
              job?.progress != null && job.active
                ? ` · ${Math.round(job.progress * 100)}%`
                : ""
            }`}
          />
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
          {output
            ? "Generated · not saved yet"
            : failed
              ? "Not generated"
              : "Generating"}
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
              aria-label={`${replaces ? "Use instead of the approved" : "Approve"} ${label.toLowerCase()}`}
              title={
                replaces
                  ? "Replaces the approved one, which returns to the explorations"
                  : undefined
              }
            >
              <Check aria-hidden="true" />{" "}
              {replaces ? "Use instead" : "Approve"}
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
      {output && (
        <CharacterReferenceEdit
          element={element}
          view={view.view}
          stateId={view.stateId}
          source={{
            type: "job-output",
            jobId: output.jobId,
            outputId: output.outputId,
          }}
        />
      )}
    </figure>
  );
}

function CharacterReferenceEdit({
  element,
  view,
  stateId,
  source,
}: {
  element: Element;
  view: ReferenceView | null;
  stateId: string | null;
  source: AssetRef;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (
    element.type !== "character" ||
    !view ||
    !["sheet", "face-closeup", "smile"].includes(view)
  )
    return null;
  if (!open)
    return (
      <Button
        className="mt-2"
        size="xs"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Edit this reference
      </Button>
    );
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          await editCharacterReference(
            element,
            view,
            stateId,
            source,
            instruction,
          );
          setOpen(false);
          setInstruction("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not start the edit");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>What should change?</span>
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Change only the sweater to forest green"
          minLength={3}
          maxLength={1000}
          required
          disabled={busy}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Makes a new version to review. The original stays available. Uses Comfy
        Cloud credits.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="xs"
          type="submit"
          disabled={busy || instruction.trim().length < 3}
        >
          {busy ? "Starting edit…" : "Generate edit"}
        </Button>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PendingBadge({ text }: { text: string }) {
  return (
    <div
      className="reference-pending flex size-full items-end p-3"
      role="status"
    >
      <span className="tabular rounded-full bg-elevated/90 px-2.5 py-1 text-xs font-medium">
        {text}
      </span>
    </div>
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
