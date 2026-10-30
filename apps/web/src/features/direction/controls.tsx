import { useId, useState } from "react";
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

/** One directing choice: preset chips plus the creator's own words. */
export function ChoiceRow({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly DirectionOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  const custom = !!value && !options.some((o) => o.id === value);
  const [writing, setWriting] = useState(custom);
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
                // Choosing the selected chip again clears it.
                onChange(on ? undefined : option.id);
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
              if (custom) onChange(undefined);
            } else setWriting(true);
          }}
          className={cn(chip, writing || custom ? chipOn : chipOff)}
        >
          Own words
        </button>
        {(writing || custom) && (
          <input
            id={`${id}-own`}
            aria-label={`${label} in your own words`}
            value={custom ? value : ""}
            disabled={disabled}
            maxLength={160}
            placeholder={`Describe the ${label.toLowerCase()}`}
            onChange={(event) => onChange(event.target.value || undefined)}
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

/** A look: palette, lighting, lens, texture and pacing. */
export function LookControls({
  look,
  onChange,
  fields = LOOK_FIELDS,
  disabled,
}: {
  look: Look;
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
          value={look[field]}
          disabled={disabled}
          onChange={(value) => onChange(setField(look, field, value))}
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
}

/** Shot choices, then the look. */
export function directionParts(
  look: Look,
  shot: ShotDirection,
  medium: "image" | "video",
): DirectionPart[] {
  const parts: DirectionPart[] = [];
  for (const field of SHOT_FIELDS) {
    const value = directionLabel(SHOT_OPTIONS[field], shot[field]);
    if (value) parts.push({ label: SHOT_FIELD_LABELS[field], value });
  }
  for (const field of LOOK_FIELDS) {
    if (field === "pacing" && medium === "image") continue;
    const value = directionLabel(LOOK_OPTIONS[field], look[field]);
    if (value) parts.push({ label: LOOK_FIELD_LABELS[field], value });
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
          title={part.label}
          className="rounded-md bg-secondary px-2 py-0.5 text-xs leading-5 text-muted-foreground"
        >
          <span className="sr-only">{part.label}: </span>
          {part.value}
        </li>
      ))}
    </ul>
  );
}
