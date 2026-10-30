import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import type { ReplacementKind } from "@/features/revision/model";
import { GOAL_ICONS } from "@/features/start/goal-icons";
import { takeGoalForKind } from "@/features/start/goals";
import "./revision.css";

/**
 * The top of a task page: what the task does in one sentence and what it
 * keeps. Changing the task swaps it in place.
 */
export function TaskHero({ kind }: { kind: ReplacementKind }) {
  const goal = takeGoalForKind(kind);
  const Icon = GOAL_ICONS[goal.id];
  return (
    <header key={goal.id} className="min-w-0">
      <h1
        id="page-title"
        className="task-hero-line flex flex-wrap items-center gap-x-3 gap-y-1 text-title font-semibold text-balance"
      >
        <Icon
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-6 shrink-0 text-tungsten"
        />
        {goal.title}
        {"caution" in goal && goal.caution && (
          <span className="rounded-sm bg-muted px-1.5 py-px text-caption font-normal tracking-normal text-muted-foreground">
            Experimental
          </span>
        )}
      </h1>
      <p
        className="task-hero-line mt-3 max-w-xl text-body text-muted-foreground"
        style={{ "--line": 1 } as CSSProperties}
      >
        {goal.promise}
      </p>
      <p
        className="task-hero-line mt-5 flex max-w-xl items-start gap-2 text-sm leading-6"
        style={{ "--line": 2 } as CSSProperties}
      >
        <Lock
          aria-hidden="true"
          className="mt-1 size-3.5 shrink-0 text-subtle-foreground"
        />
        <span>
          {goal.keeps}
          {"caution" in goal && goal.caution && (
            <span className="block text-muted-foreground">
              {/* The chip above already says "Experimental". */}
              {goal.caution.replace(/^Experimental\.\s*/, "")}
            </span>
          )}
        </span>
      </p>
    </header>
  );
}
