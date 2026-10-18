import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { approvedMotionReferences } from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openInStudio } from "@/features/generation/draft";
import type { CostPreferences } from "@/features/settings/preferences";
import { describeViewRequests } from "./generate";
import {
  stateHandle,
  SUBJECT_NOUN,
  viewRequest,
  type Element,
  type ElementState,
  type GuidanceSlot,
  type NextStep,
} from "./model";

/** "@Cal" or "@Cal:wet", as a prompt writes it. */
export function mentionOf(element: Element, state: ElementState | null) {
  return `@${element.handle}${state ? `:${stateHandle(state)}` : ""}`;
}

/**
 * Opens the Studio with the mention written in. A Location with a moving
 * reference starts on video, where References carries its architecture.
 */
export function useInStudio(element: Element, state: ElementState | null) {
  const navigate = useNavigate();
  return () => {
    const moving =
      element.type === "location" &&
      approvedMotionReferences(element, state?.id).length > 0;
    openInStudio({
      prompt: `${mentionOf(element, state)} `,
      medium: moving ? "video" : "image",
      overrides: {},
      shot: {},
    });
    void navigate({ to: "/studio" });
  };
}

function list(slots: readonly GuidanceSlot[]) {
  const names = slots.map((s) => s.label.toLowerCase());
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The one obvious action on a reference sheet. It sits above the checklist
 * and changes as the sheet fills: make the anchor, approve it, make the rest
 * from it, then use the Element.
 */
export function NextStepPanel({
  element,
  state,
  step,
  busy,
  preferences,
  onGenerate,
}: {
  element: Element;
  state: ElementState | null;
  step: NextStep;
  busy: boolean;
  preferences: CostPreferences;
  onGenerate: (slots: GuidanceSlot[]) => void;
}) {
  const use = useInStudio(element, state);
  // The step animates when it changes here, not when the page opens.
  const [arrivedAt] = useState(step.kind);
  const subject = state
    ? `${element.name} ${state.name.toLowerCase()}`
    : element.name;
  const cost = (slots: GuidanceSlot[]) =>
    describeViewRequests(
      slots.map((slot) => viewRequest(element, slot, state)),
      preferences,
    );

  let title: string;
  let body: string;
  let action: { label: string; slots: GuidanceSlot[] } | null = null;
  let secondary: { label: string; slots: GuidanceSlot[] } | null = null;
  switch (step.kind) {
    case "start":
      title = `Make the ${step.slot.label.toLowerCase()}`;
      body = `${step.slot.hint.replace(/ Make it first[^.]*\./, "")} Every other view of ${subject} is made to match it.`;
      action = { label: "Generate", slots: [step.slot] };
      break;
    case "review":
      title = `Choose the ${step.slot.label.toLowerCase()}`;
      body =
        "Results land in Explorations. Approve the one that looks right; the rest of the sheet is made from it.";
      secondary = { label: "Try another", slots: [step.slot] };
      break;
    case "finish":
      title = "Finish the sheet";
      body =
        step.slots.length === 1
          ? `Makes the ${list(step.slots)}, guided by what you approved, so it shows the same ${SUBJECT_NOUN[element.type]}.`
          : `Makes the ${list(step.slots)} together, guided by what you approved, so every view shows the same ${SUBJECT_NOUN[element.type]}.`;
      action = {
        label: `Generate ${step.slots.length === 1 ? "1 view" : `${step.slots.length} views`}`,
        slots: step.slots,
      };
      break;
    case "reviewing":
      title = "Review the new views";
      body = `${step.waiting === 1 ? "One view lands" : `${step.waiting} views land`} in Explorations. Approve what matches; anything you reject can be generated again from the checklist.`;
      break;
    case "ready":
      title = state ? `${state.name} is ready` : `${element.name} is ready`;
      body = `Mention ${mentionOf(element, state)} in the Studio or a Sequence and its approved references come along.`;
      break;
  }

  return (
    <div
      key={step.kind}
      className={cn(
        "rounded-xl bg-surface p-4",
        step.kind !== arrivedAt && "elements-step",
      )}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        {step.kind === "ready" && (
          <Check aria-hidden="true" className="size-4 text-success" />
        )}
        {title}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      {action && (
        <>
          <Button
            className="mt-4 w-full"
            disabled={busy}
            onClick={() => onGenerate(action.slots)}
          >
            <Sparkles aria-hidden="true" />
            {busy ? "Starting…" : action.label}
          </Button>
          <p className="tabular mt-2 text-xs leading-5 text-muted-foreground">
            {cost(action.slots)}.
          </p>
        </>
      )}
      {secondary && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          disabled={busy}
          onClick={() => onGenerate(secondary.slots)}
          title={cost(secondary.slots)}
        >
          {busy ? "Starting…" : secondary.label}
        </Button>
      )}
      {step.kind === "ready" && (
        <Button className="mt-4 w-full" onClick={use}>
          Use {mentionOf(element, state)} in Studio
          <ArrowRight aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
