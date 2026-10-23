import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import { LoopingClip } from "@/components/looping-clip";
import type { ReplacementKind } from "@/features/revision/model";
import { GOAL_ICONS } from "@/features/start/goal-icons";
import { takeGoalForKind } from "@/features/start/goals";
import "./revision.css";

/**
 * The top of a task page: what the task does in one sentence, what it keeps,
 * and the task done on real footage. Changing the task swaps it in place.
 */
export function TaskHero({ kind }: { kind: ReplacementKind }) {
  const goal = takeGoalForKind(kind);
  const Icon = GOAL_ICONS[goal.id];
  return (
    <header className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
      <div key={goal.id} className="min-w-0">
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
      </div>
      <figure className="relative aspect-video overflow-hidden rounded-xl bg-letterbox">
        <div key={goal.id} className="task-hero-clip size-full">
          <LoopingClip
            src={`/examples/${goal.id}.mp4`}
            poster={`/examples/${goal.id}.jpg`}
          />
        </div>
        <figcaption
          key={`caption-${goal.id}`}
          className="task-hero-line absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-md bg-scrim/85 px-2 py-1 text-caption text-on-media"
          style={{ "--line": 1 } as CSSProperties}
        >
          Example: {goal.example}
        </figcaption>
      </figure>
    </header>
  );
}
