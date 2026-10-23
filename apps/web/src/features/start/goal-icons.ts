import {
  Brush,
  Expand,
  FastForward,
  Film,
  Footprints,
  Mountain,
  Package,
  Palette,
  PenLine,
  RotateCcw,
  Sparkles,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { GoalId } from "./goals";

/** One icon per goal, shared by the front page, the top bar and the studio. */
export const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  move: Mountain,
  recast: UserRound,
  moves: Footprints,
  swap: Package,
  fix: Brush,
  redo: RotateCcw,
  longer: FastForward,
  reframe: Expand,
  effect: Sparkles,
  look: Palette,
  camera: Video,
  shot: PenLine,
  scene: Film,
};
