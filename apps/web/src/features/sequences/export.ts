import {
  approvedTake,
  composeShotPrompt,
  lookPrompt,
  withDirection,
  type Project,
  type Sequence,
} from "@open-cinema/contracts";
import { assetUrl } from "@/features/elements/model";
import { playedSeconds } from "./model";

/**
 * Production material: the plan as a shot list, with each shot's direction,
 * the exact prompts its approved takes were made with, and where to fetch them.
 */
export function exportShotList(sequence: Sequence, project: Project | null) {
  const origin = window.location.origin;
  const url = (path: string) => new URL(path, origin).href;
  let at = 0;
  const shots = sequence.shots.map((shot, index) => {
    const keyframe = approvedTake(shot, "keyframe");
    const motion = approvedTake(shot, "motion");
    const start = at;
    at += playedSeconds(shot);
    return {
      number: index + 1,
      title: shot.title,
      beat: shot.beat,
      staging: shot.staging,
      prompt: shot.prompt,
      framing: shot.framing,
      camera: shot.camera,
      durationSeconds: playedSeconds(shot),
      startsAtSeconds: start,
      continuity: shot.continuity,
      direction: withDirection(
        composeShotPrompt(shot, { role: "motion" }),
        project ? { overrides: project.look } : undefined,
        "video",
      ),
      keyframe: keyframe?.asset
        ? {
            url: url(assetUrl(keyframe.asset)),
            origin: keyframe.origin,
            prompt: keyframe.prompt,
          }
        : null,
      motion: motion?.asset
        ? {
            url: url(assetUrl(motion.asset)),
            origin: motion.origin,
            prompt: motion.prompt,
          }
        : null,
    };
  });
  const manifest = {
    format: "open-cinema.shot-list",
    version: 1,
    exportedAt: new Date().toISOString(),
    title: sequence.title,
    idea: sequence.idea,
    project: project
      ? { name: project.name, look: lookPrompt(project.look, "video") }
      : null,
    runningTimeSeconds: at,
    shots,
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${sequence.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "sequence"} shot list.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
