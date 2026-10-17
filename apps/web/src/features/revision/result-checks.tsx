import {
  CircleCheck,
  LoaderCircle,
  ScanFace,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Preflight, ResultChecks } from "./shot-checks";
import { useResultChecks } from "./shot-checks-client";

type Tone = "ok" | "warn" | "muted";
interface Line {
  tone: Tone;
  title: string;
  detail: string;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** For a swap or restyle, which should leave every person as they were. */
function describePeople(checks: ResultChecks): Line[] {
  const changed = checks.bystanders.filter((b) => b.changed);
  if (changed.length)
    return [
      {
        tone: "warn",
        title:
          changed.length === 1
            ? "A person changed"
            : `${changed.length} people changed`,
        detail:
          "Their faces no longer match the original. Compare them with the wipe before keeping it.",
      },
    ];
  if (checks.bystanders.length)
    return [
      {
        tone: "ok",
        title:
          checks.bystanders.length === 1
            ? "The person is unchanged"
            : `All ${checks.bystanders.length} people are unchanged`,
        detail: `Lowest face match to the original: ${pct(Math.min(...checks.bystanders.map((b) => b.similarity)))}.`,
      },
    ];
  return [
    {
      tone: "muted",
      title: "No faces compared",
      detail:
        "No face was seen clearly in both clips. Check the people yourself.",
    },
  ];
}

/** What the post-run checks found, in the creator's terms. */
export function describeChecks(
  checks: ResultChecks,
  /** Null for a revision that recasts no one. */
  characterName: string | null,
  preflight: Preflight | null,
): Line[] {
  if (characterName === null) return describePeople(checks);
  const lines: Line[] = [];
  if (checks.likenessVerdict === "unmeasured")
    lines.push({
      tone: "muted",
      title: "Likeness not measured",
      detail:
        "Their face was not seen clearly enough on the compared frames. Judge the resemblance yourself.",
    });
  else if (checks.likenessVerdict === "weak")
    lines.push({
      tone: "warn",
      title: `May not read as ${characterName}`,
      detail: `Face match to ${characterName}’s references is weak (${pct(checks.likeness!)}).${
        preflight?.reasons.includes("small-face")
          ? " Small faces lose likeness most."
          : ""
      } Check the close frames before keeping it.`,
    });
  else
    lines.push({
      tone: "ok",
      title: `Reads as ${characterName}`,
      detail: `Face match to ${characterName}’s references: ${pct(checks.likeness!)}${checks.likenessVerdict === "fair" ? ", fair" : ""}.`,
    });

  if (checks.targetChanged === "no")
    lines.push({
      tone: "warn",
      title: "The marked person may be unchanged",
      detail: `Their face still matches the original (${pct(checks.sourceSimilarity!)}).`,
    });

  const changed = checks.bystanders.filter((b) => b.changed);
  if (checks.wrongPerson)
    lines.push({
      tone: "warn",
      title: "Someone else may have been recast",
      detail: `Another person now looks more like ${characterName} than like themselves.${
        checks.targetChanged === "no"
          ? " The model likely recast the wrong person."
          : ""
      } Compare everyone in the shot before keeping it.`,
    });
  else if (changed.length)
    lines.push({
      tone: "warn",
      title:
        changed.length === 1
          ? "Another person changed"
          : `${changed.length} other people changed`,
      detail:
        "Their faces no longer match the original. Compare them with the wipe.",
    });
  else if (checks.bystanders.length)
    lines.push({
      tone: "ok",
      title:
        checks.bystanders.length === 1
          ? "The other person is unchanged"
          : `The other ${checks.bystanders.length} people are unchanged`,
      detail: `Lowest face match to the original: ${pct(Math.min(...checks.bystanders.map((b) => b.similarity)))}.`,
    });
  return lines;
}

export function ResultChecksPanel({
  revisionId,
  stored,
  characterName,
  canCheck,
  preflight,
}: {
  revisionId: string;
  stored: ResultChecks | null;
  characterName: string | null;
  canCheck: boolean;
  preflight: Preflight | null;
}) {
  const live = useResultChecks(revisionId);
  const checks = stored ?? (live.status === "ready" ? live.checks : null);
  if (!checks && !canCheck) return null;

  return (
    <section
      aria-labelledby="result-checks-title"
      aria-busy={live.status === "checking"}
      className="mt-5 rounded-xl bg-surface p-4"
    >
      <h2
        id="result-checks-title"
        className="flex items-center gap-2 text-sm font-medium"
      >
        <ScanFace
          aria-hidden="true"
          className="size-4 text-subtle-foreground"
        />
        Checks on this result
      </h2>
      {checks ? (
        <ul className="result-checks mt-3 grid gap-3 sm:grid-cols-2">
          {describeChecks(checks, characterName, preflight).map((line) => (
            <li key={line.title} className="flex gap-2.5 text-xs leading-5">
              {line.tone === "warn" ? (
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-warning"
                />
              ) : (
                <CircleCheck
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    line.tone === "ok"
                      ? "text-success"
                      : "text-subtle-foreground",
                  )}
                />
              )}
              <span>
                <span className="block font-medium text-foreground">
                  {line.title}
                </span>
                <span className="block text-muted-foreground">
                  {line.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : live.status === "failed" ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          The checks could not run in this browser. Compare the faces yourself
          before keeping it.
        </p>
      ) : (
        <p
          className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="shot-check-spin size-3.5"
          />
          {characterName
            ? `Comparing faces with the original and ${characterName}…`
            : "Comparing faces with the original…"}
        </p>
      )}
      <p className="mt-3 text-[0.6875rem] leading-4 text-subtle-foreground">
        Measured on {checks?.framesCompared ?? 10} matched frames with an
        on-device face model. A guide for your review, not a verdict.
      </p>
    </section>
  );
}
