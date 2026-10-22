import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  directionLabel,
  LOOK_FIELD_LABELS,
  LOOK_FIELDS,
  LOOK_OPTIONS,
  SHOT_FIELD_LABELS,
  SHOT_FIELDS,
  SHOT_OPTIONS,
  type DirectionOption,
  type Look,
  type LookField,
  type ShotDirection,
} from "@open-cinema/contracts";
import { cn } from "@/lib/utils";
import "./direction.css";

const chip =
  "inline-flex h-8 items-center rounded-full border px-3 text-label whitespace-nowrap transition-[color,background-color,border-color] duration-(--duration-quick) outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const chipOff =
  "border-border text-muted-foreground hover:border-input hover:text-foreground";
const chipOn = "border-tungsten/70 bg-tungsten/12 text-foreground";

/**
 * One directing choice: preset chips plus the creator's own words. With a
 * `base` (the project look), a different value reads as an override for this
 * shot and can be reset; the project itself is never changed from here.
 */
export function ChoiceRow({
  label,
  options,
  value,
  base,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly DirectionOption[];
  value: string | undefined;
  /** Present when this row overrides an inherited value. */
  base?: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  const custom = !!value && !options.some((o) => o.id === value);
  const [writing, setWriting] = useState(custom);
  const inheriting = base !== undefined;
  const overridden = inheriting && (value ?? "") !== (base ?? "");
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="grid gap-x-4 gap-y-2 sm:grid-cols-[7.5rem_1fr]"
    >
      <div className="pt-1.5">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        {overridden && (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            Project: {directionLabel(options, base) || "none"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const on = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              title={option.hint}
              onClick={() => {
                setWriting(false);
                // Choosing the selected chip again clears it; with a project
                // look underneath, clearing turns the field off for this shot.
                onChange(on ? (inheriting ? "" : undefined) : option.id);
              }}
              className={cn(chip, on ? chipOn : chipOff)}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={writing || custom}
          aria-controls={`${id}-own`}
          onClick={() => {
            if (writing || custom) {
              setWriting(false);
              if (custom) onChange(inheriting ? "" : undefined);
            } else setWriting(true);
          }}
          className={cn(chip, writing || custom ? chipOn : chipOff)}
        >
          Own words
        </button>
        {overridden && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setWriting(false);
              onChange(undefined);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Use project’s
          </button>
        )}
        {(writing || custom) && (
          <input
            id={`${id}-own`}
            aria-label={`${label} in your own words`}
            value={custom ? value : ""}
            disabled={disabled}
            maxLength={160}
            placeholder={`Describe the ${label.toLowerCase()}`}
            onChange={(event) =>
              onChange(
                event.target.value
                  ? event.target.value
                  : inheriting
                    ? ""
                    : undefined,
              )
            }
            className="h-8 min-w-48 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>
    </div>
  );
}

function setField<T extends object>(
  object: T,
  key: keyof T,
  value: string | undefined,
): T {
  const next = { ...object };
  if (value === undefined) delete next[key];
  else (next as Record<keyof T, string>)[key] = value;
  return next;
}

/** The project look, or a shot's overrides of it when `base` is given. */
export function LookControls({
  look,
  base,
  onChange,
  fields = LOOK_FIELDS,
  disabled,
}: {
  look: Look;
  base?: Look | undefined;
  onChange: (look: Look) => void;
  fields?: readonly LookField[];
  disabled?: boolean | undefined;
}) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <ChoiceRow
          key={field}
          label={LOOK_FIELD_LABELS[field]}
          options={LOOK_OPTIONS[field]}
          value={field in look ? look[field] : base?.[field]}
          base={base ? (base[field] ?? "") : undefined}
          disabled={disabled}
          onChange={(value) => {
            // Back to the project's value means no override at all.
            const same = base && (value ?? "") === (base[field] ?? "");
            onChange(setField(look, field, same ? undefined : value));
          }}
        />
      ))}
    </div>
  );
}

export function ShotControls({
  shot,
  onChange,
  disabled,
}: {
  shot: ShotDirection;
  onChange: (shot: ShotDirection) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="grid gap-3">
      {SHOT_FIELDS.map((field) => (
        <ChoiceRow
          key={field}
          label={SHOT_FIELD_LABELS[field]}
          options={SHOT_OPTIONS[field]}
          value={shot[field]}
          disabled={disabled}
          onChange={(value) =>
            onChange(setField(shot, field, value || undefined))
          }
        />
      ))}
    </div>
  );
}

export interface DirectionPart {
  label: string;
  value: string;
  /** A shot override of the project look. */
  override: boolean;
}

/** Shot choices, then the effective look, each marked when it overrides the project. */
export function directionParts(
  look: Look,
  base: Look | undefined,
  shot: ShotDirection,
  medium: "image" | "video",
): DirectionPart[] {
  const parts: DirectionPart[] = [];
  for (const field of SHOT_FIELDS) {
    const value = directionLabel(SHOT_OPTIONS[field], shot[field]);
    if (value)
      parts.push({ label: SHOT_FIELD_LABELS[field], value, override: false });
  }
  for (const field of LOOK_FIELDS) {
    if (field === "pacing" && medium === "image") continue;
    const effective = field in look ? look[field] : base?.[field];
    const value = directionLabel(LOOK_OPTIONS[field], effective);
    const override =
      !!base && field in look && (look[field] ?? "") !== (base[field] ?? "");
    if (value) parts.push({ label: LOOK_FIELD_LABELS[field], value, override });
    else if (override)
      parts.push({ label: LOOK_FIELD_LABELS[field], value: "Off", override });
  }
  return parts;
}

export function DirectionChips({
  parts,
  className,
}: {
  parts: readonly DirectionPart[];
  className?: string;
}) {
  if (!parts.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {parts.map((part) => (
        <li
          key={part.label}
          title={part.override ? "Changed for this shot" : part.label}
          className={cn(
            "rounded-md px-2 py-0.5 text-xs leading-5",
            part.override
              ? "bg-tungsten/12 text-foreground ring-1 ring-tungsten/50"
              : "bg-secondary text-muted-foreground",
          )}
        >
          <span className="sr-only">{part.label}: </span>
          {part.value}
          {part.override && <span className="sr-only"> (shot override)</span>}
        </li>
      ))}
    </ul>
  );
}
