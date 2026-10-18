import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StartPage } from "@/features/start/start-page";
import { goalById, goalIds } from "@/features/start/goals";
export const Route = createFileRoute("/")({
  validateSearch: z.object({ goal: z.enum(goalIds).optional() }),
  component: Start,
});
function Start() {
  const { goal } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StartPage
      goal={goalById(goal)}
      onGoal={(id) =>
        void navigate({
          search: { goal: id },
          replace: true,
          resetScroll: false,
        })
      }
    />
  );
}
