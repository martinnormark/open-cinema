import { useId, useState } from "react";
import {
  CAPABILITIES,
  recipeSpecProblems,
  recipeSpecSchema,
  templateSlotKeys,
  type CapabilityId,
  type ElementType,
  type Look,
  type RecipeSlot,
  type RecipeSpec,
  type RecipeSpecInput,
  type ShotDirection,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { elementTypes } from "@/features/elements/model";
import { LookControls, ShotControls } from "@/features/direction/controls";

export interface RecipeDraftFields {
  name: string;
  summary: string;
  spec: RecipeSpecInput;
}

export interface RecipeSaveFields {
  name: string;
  summary: string;
  spec: RecipeSpec;
  note: string;
}

const ASPECTS = [
  { id: "1:1", label: "Square" },
  { id: "16:9", label: "16:9" },
  { id: "21:9", label: "Scope 21:9" },
  { id: "9:16", label: "Vertical" },
] as const;
const DURATIONS = [4, 6, 8, 10] as const;

/** A slot guessed from its key until the creator says otherwise. */
function defaultSlot(key: string): RecipeSlot {
  const type: ElementType = /place|location|set|room|land/.test(key)
    ? "location"
    : /thing|object|prop|item/.test(key)
      ? "thing"
      : "character";
  return {
    key,
    type,
    label: key[0]!.toUpperCase() + key.slice(1),
    optional: false,
    hint: "",
  };
}

/**
 * Edits everything a recipe keeps. Slots follow the template: each `{key}`
 * gets a row, and removing it from the template removes the slot.
 */
export function RecipeEditor({
  initial,
  askForNote = false,
  submitLabel,
  onCancel,
  onSave,
}: {
  initial: RecipeDraftFields;
  askForNote?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSave: (fields: RecipeSaveFields) => Promise<void>;
}) {
  const id = useId();
  const start = recipeSpecSchema.parse(initial.spec);
  const [name, setName] = useState(initial.name);
  const [summary, setSummary] = useState(initial.summary);
  const [medium, setMedium] = useState(start.medium);
  const [template, setTemplate] = useState(start.template);
  const [slotEdits, setSlotEdits] = useState<Record<string, RecipeSlot>>(() =>
    Object.fromEntries(start.slots.map((s) => [s.key, s])),
  );
  const [look, setLook] = useState<Look>(start.look);
  const [shot, setShot] = useState<ShotDirection>(start.shot);
  const [aspectRatio, setAspectRatio] = useState(start.aspectRatio);
  const [durationSeconds, setDuration] = useState(start.durationSeconds);
  const [capabilities, setCapabilities] = useState(start.capabilities);
  const [notes, setNotes] = useState(start.notes);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slots = templateSlotKeys(template).map(
    (key) => slotEdits[key] ?? defaultSlot(key),
  );
  const spec: RecipeSpecInput = {
    medium,
    template,
    slots,
    look,
    shot,
    aspectRatio,
    durationSeconds,
    // Kept as made; the editor has no camera control yet.
    camera: start.camera,
    capabilities,
    notes,
  };
  const problems = [
    ...(name.trim() ? [] : ["Give the recipe a name."]),
    ...(template.trim().length < 3 ? ["Write the prompt template."] : []),
    ...(slots.length > 4 ? ["A recipe takes at most four slots."] : []),
    ...recipeSpecProblems(spec),
  ];
  const offered = Object.values(CAPABILITIES).filter(
    (c) => c.status === "ready" && c.media.includes(medium),
  );

  function editSlot(slot: RecipeSlot, change: Partial<RecipeSlot>) {
    setSlotEdits((edits) => ({ ...edits, [slot.key]: { ...slot, ...change } }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (problems.length) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        summary: summary.trim(),
        spec: recipeSpecSchema.parse({
          ...spec,
          capabilities: capabilities.filter((c) =>
            CAPABILITIES[c].media.includes(medium),
          ),
        }),
        note: note.trim(),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The recipe could not be saved.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-8 grid max-w-3xl gap-10">
      <Section title="Name it">
        <Field label="Name" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="What it’s for"
          htmlFor={`${id}-summary`}
          hint="One line shown in your collection."
        >
          <Input
            id={`${id}-summary`}
            value={summary}
            maxLength={300}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
      </Section>

      <Section
        title="Prompt"
        description="Write {name} where an Element goes. Put a phrase in [square brackets] to leave it out when its slot is empty."
      >
        <ToggleGroup
          type="single"
          variant="outline"
          value={medium}
          onValueChange={(value) =>
            value && setMedium(value as RecipeSpec["medium"])
          }
          aria-label="Makes"
          className="justify-start"
        >
          <ToggleGroupItem value="image" className="px-3">
            Still image
          </ToggleGroupItem>
          <ToggleGroupItem value="video" className="px-3">
            Video
          </ToggleGroupItem>
        </ToggleGroup>
        <Field label="Template" htmlFor={`${id}-template`}>
          <Textarea
            id={`${id}-template`}
            value={template}
            maxLength={1500}
            rows={4}
            onChange={(e) => setTemplate(e.target.value)}
            className="font-mono text-label leading-6"
          />
        </Field>
        {slots.length > 0 && (
          <ul className="grid gap-3" aria-label="Slots">
            {slots.map((slot) => (
              <li
                key={slot.key}
                className="grid items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3 sm:grid-cols-[7rem_auto_1fr_auto]"
              >
                <code className="recipe-slot-token w-fit">{`{${slot.key}}`}</code>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={slot.type}
                  onValueChange={(value) =>
                    value && editSlot(slot, { type: value as ElementType })
                  }
                  aria-label={`${slot.label} is a`}
                >
                  {Object.values(elementTypes).map((t) => (
                    <ToggleGroupItem
                      key={t.type}
                      value={t.type}
                      className="px-3"
                    >
                      {t.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Input
                  aria-label={`Label for {${slot.key}}`}
                  value={slot.label}
                  maxLength={40}
                  onChange={(e) => editSlot(slot, { label: e.target.value })}
                  className="h-8"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={slot.optional}
                    onChange={(e) =>
                      editSlot(slot, { optional: e.target.checked })
                    }
                    className="size-4 accent-[var(--color-tungsten)]"
                  />
                  Optional
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Shot">
        <ShotControls shot={shot} onChange={setShot} />
      </Section>

      <Section
        title="Look"
        description="Where the recipe says nothing, the project’s look applies."
      >
        <LookControls look={look} onChange={setLook} />
      </Section>

      <Section title="Frame">
        {medium === "image" ? (
          <ToggleGroup
            type="single"
            variant="outline"
            value={aspectRatio}
            onValueChange={(value) =>
              value && setAspectRatio(value as RecipeSpec["aspectRatio"])
            }
            aria-label="Aspect ratio"
            className="justify-start"
          >
            {ASPECTS.map((a) => (
              <ToggleGroupItem key={a.id} value={a.id} className="px-3">
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(durationSeconds)}
            onValueChange={(value) =>
              value &&
              setDuration(Number(value) as RecipeSpec["durationSeconds"])
            }
            aria-label="Length"
            className="justify-start"
          >
            {DURATIONS.map((d) => (
              <ToggleGroupItem
                key={d}
                value={String(d)}
                className="tabular px-3"
              >
                {d} s
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </Section>

      <Section
        title="Building blocks"
        description="What this recipe relies on, so anyone applying it knows what to expect."
      >
        <div className="flex flex-wrap gap-1.5">
          {offered.map((c) => {
            const on = capabilities.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                title={c.purpose}
                onClick={() =>
                  setCapabilities((list) =>
                    on
                      ? list.filter((x) => x !== c.id)
                      : [...list, c.id as CapabilityId],
                  )
                }
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-label transition-[color,background-color,border-color] duration-(--duration-quick) outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-tungsten/70 bg-tungsten/12 text-foreground"
                    : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <Field
          label="What to expect"
          htmlFor={`${id}-notes`}
          hint="Where it shines and where it struggles."
        >
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </Section>

      <div className="grid gap-4 border-t border-border pt-6">
        {askForNote && (
          <Field
            label="What changed"
            htmlFor={`${id}-note`}
            hint="Kept with this version in the history."
          >
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
        {problems.length > 0 && (
          <ul className="text-sm leading-6 text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || problems.length > 0}>
            {busy ? "Saving…" : submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-3 text-body font-medium">{title}</legend>
      {description && (
        <p className="-mt-1 max-w-prose text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
