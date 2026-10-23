import type { ElementType } from "@open-cinema/contracts";
import {
  replacementKinds,
  type ReplacementKind,
} from "@/features/revision/model";

/**
 * What a creator arrives wanting, in their words, and the workflow that does
 * it best today. docs/task-map.md records the evidence behind each choice.
 */
interface GoalBase {
  id: string;
  /** Take goals use the revision studio's label, so the mode reads the same there. */
  title: string;
  /** One sentence: the result, not the method. */
  promise: string;
  /** The Element type that makes the result yours, if any. */
  element: ElementType | null;
}
export interface TakeGoal extends GoalBase {
  source: "take";
  kind: ReplacementKind;
  /** The top bar's label: one or two words. */
  short: string;
  keeps: string;
  /** What the example loop in public/examples shows, as a caption. */
  example: string;
  /** Said up front when the workflow only holds inside a narrow envelope. */
  caution?: string;
  /** Listed under "More ways to change a take", so the first list stays short. */
  more?: true;
}
export interface WorldGoal extends GoalBase {
  source: "world";
  to: "/studio" | "/sequences";
  action: string;
}
export type Goal = TakeGoal | WorldGoal;

export const goals = [
  {
    id: "move",
    source: "take",
    short: "Background",
    kind: "background",
    // The revision studio's own name, so the mode reads the same there.
    title: replacementKinds.background.label,
    promise: "The same take in a new place, with the people exactly as filmed.",
    element: "location",
    keeps: "Keeps the performers, their timing and the camera.",
    example: "the kitchen table take, moved to a cottage by the sea",
  },
  {
    id: "recast",
    source: "take",
    short: "Recast",
    kind: "character",
    title: replacementKinds.character.label,
    promise: "The same performance, played by one of your Characters.",
    element: "character",
    keeps: "Keeps the acting, the camera and everyone else.",
    example: "the young man at the table, played by another Character",
    caution:
      "Experimental. Holds while the face stays clear and medium or larger.",
  },
  {
    id: "moves",
    source: "take",
    short: "Copy moves",
    kind: "moves",
    title: replacementKinds.moves.label,
    promise:
      "A dance, a stunt or a gesture from any clip, performed by one of your Characters.",
    element: "character",
    keeps: "Keeps every step, the timing, the camera and the sound.",
    example: "a studio dance, performed by Cal at the Tide Mill",
  },
  {
    id: "swap",
    source: "take",
    short: "Swap object",
    kind: "object",
    title: replacementKinds.object.label,
    promise: "One thing in the shot becomes one of your Things.",
    element: "thing",
    keeps: "Keeps every pixel outside the object.",
    example: "the table lamp swapped for the storm lantern",
  },
  {
    id: "fix",
    source: "take",
    short: "Fix area",
    kind: "area",
    title: replacementKinds.area.label,
    promise: "Paint over something to remove it, or say what goes there.",
    element: null,
    keeps: "Keeps every pixel outside what you paint.",
    example: "the glass on the table painted out",
  },
  {
    id: "redo",
    source: "take",
    short: "Redo moment",
    kind: "moment",
    title: replacementKinds.moment.label,
    promise: "A few seconds acted again; the take either side stays.",
    element: "character",
    keeps: "Keeps the take before and after the moment, and its sound.",
    example: "a second and a half of his answer, acted again",
  },
  {
    id: "longer",
    source: "take",
    short: "Extend",
    kind: "extend",
    title: replacementKinds.extend.label,
    promise: "The shot carries on past its last frame, without a cut.",
    element: "character",
    keeps: "Keeps the whole take as shot; the new seconds follow it.",
    example: "the kitchen take, carried on three seconds past its end",
  },
  {
    id: "reframe",
    source: "take",
    short: "Reframe",
    kind: "reframe",
    title: replacementKinds.reframe.label,
    promise: "Vertical, square or wide, with the new edges drawn in.",
    element: null,
    keeps: "Keeps the take whole in the middle of the new frame.",
    example: "a wide take made vertical, the ceiling and floor drawn in",
  },
  {
    id: "effect",
    source: "take",
    short: "Effects",
    kind: "effect",
    title: replacementKinds.effect.label,
    promise: "Rain or a flood, day for night, or a cleared set.",
    element: null,
    keeps: "Keeps the performance, the camera and the framing.",
    example: "day for night on a street-side take",
    more: true,
  },
  {
    id: "look",
    source: "take",
    short: "Restyle",
    kind: "restyle",
    title: replacementKinds.restyle.label,
    promise: "The whole take repainted from a Location or a style image.",
    element: "location",
    keeps: "Keeps the performance and the camera. Faces restyle too.",
    example: "a daytime café take restyled to evening",
    more: true,
  },
  {
    id: "camera",
    source: "take",
    short: "Camera",
    kind: "camera",
    title: replacementKinds.camera.label,
    promise: "The same take, filmed from a little closer or to one side.",
    element: null,
    keeps: "Keeps the performance and the timing.",
    example: "the café take, filmed from a step further back",
    more: true,
  },
  {
    id: "shot",
    source: "world",
    to: "/studio",
    title: "Make a shot",
    promise: "Write the moment and bring in your Elements with @.",
    element: null,
    action: "Start from words",
  },
  {
    id: "scene",
    source: "world",
    to: "/sequences",
    title: "Plan a scene",
    promise: "A few sentences become shots that cut together.",
    element: null,
    action: "Write the scene",
  },
] as const satisfies readonly Goal[];

export type GoalId = (typeof goals)[number]["id"];
export const goalIds = goals.map((g) => g.id) as [GoalId, ...GoalId[]];

export function goalById(id: GoalId | undefined): Goal {
  return goals.find((g) => g.id === id) ?? goals[0];
}

export const takeGoals = goals.filter(
  (g): g is Extract<(typeof goals)[number], { source: "take" }> =>
    g.source === "take",
);

/** The take goal behind a revision studio mode; every mode has one. */
export function takeGoalForKind(kind: ReplacementKind) {
  return takeGoals.find((g) => g.kind === kind) ?? takeGoals[0]!;
}
