import {
  approvedTake,
  composeShotPrompt,
  isActiveJob,
  resultOutputs,
  type AssetRef,
  type Element,
  type GenerationRequest,
  type Job,
  type Shot,
  type ShotCamera,
  type ShotFraming,
  type ShotTake,
} from "@open-cinema/contracts";
import { assetUrl } from "@/features/elements/model";
import { mentionPayload, resolveMentions } from "@/features/elements/mentions";

export const framingLabels: Record<ShotFraming, string> = {
  wide: "Wide",
  medium: "Medium",
  close: "Close-up",
  "extreme-close": "Extreme close-up",
  "over-shoulder": "Over the shoulder",
  insert: "Insert",
};

export const cameraLabels: Record<ShotCamera, string> = {
  static: "Locked off",
  "push-in": "Push in",
  "pull-out": "Pull out",
  pan: "Pan",
  tracking: "Tracking",
  handheld: "Handheld",
  orbit: "Orbit",
  crane: "Crane",
};

export const DURATIONS = [2, 3, 4, 5, 6, 8, 10] as const;

/** Motion runs on FLUX 3 Video, which makes clips of 5 to 20 seconds. */
export const MIN_MOTION_SECONDS = 5;

/**
 * How long a shot lasts in the cut: its planned length as a still, at least
 * five seconds once an approved motion take animates it.
 */
export function playedSeconds(shot: Shot): number {
  return approvedTake(shot, "motion")
    ? Math.max(MIN_MOTION_SECONDS, shot.durationSeconds)
    : shot.durationSeconds;
}

/** A take as the board shows it: the stored asset, or its job's live state. */
export interface TakeView {
  take: ShotTake;
  asset: AssetRef | null;
  phase: "working" | "ready" | "failed";
  progress: number | null;
  stage: string | null;
  error: string | null;
}

export function takeView(take: ShotTake, jobs: readonly Job[]): TakeView {
  if (take.asset)
    return {
      take,
      asset: take.asset,
      phase: "ready",
      progress: null,
      stage: null,
      error: null,
    };
  const job = jobs.find((j) => j.id === take.jobId);
  const output = resultOutputs(job?.outputs ?? []).find((o) => o.r2Key);
  if (job && output)
    return {
      take,
      asset: { type: "job-output", jobId: job.id, outputId: output.id },
      phase: "ready",
      progress: null,
      stage: null,
      error: null,
    };
  const failed =
    job &&
    !isActiveJob(job.state) &&
    (job.state !== "succeeded" || !job.outputs.length);
  return {
    take,
    asset: null,
    phase: failed ? "failed" : "working",
    progress: job?.progress ?? null,
    stage: job?.stage ?? null,
    error: failed
      ? (job.error ??
        (job.state === "cancelled"
          ? "Cancelled."
          : "This take did not finish."))
      : null,
  };
}

export function takeUrl(asset: AssetRef): string {
  return assetUrl(asset);
}

/** What the shot shows right now: its approved motion, else its keyframe. */
export function shotPicture(
  shot: Shot,
): { asset: AssetRef; kind: "video" | "image" } | null {
  const motion = approvedTake(shot, "motion");
  if (motion?.asset) return { asset: motion.asset, kind: "video" };
  const keyframe = approvedTake(shot, "keyframe");
  if (keyframe?.asset) return { asset: keyframe.asset, kind: "image" };
  return null;
}

/**
 * A keyframe is a FLUX 3 still: conditioned on the mentioned Elements'
 * approved references when there are any, so the cast and place hold.
 */
export function keyframeRequest(
  shot: Shot,
  elements: readonly Element[],
): GenerationRequest {
  const prompt = composeShotPrompt(shot, { role: "keyframe" });
  const payload = mentionPayload(resolveMentions(shot.prompt, elements));
  const base = {
    prompt,
    aspectRatio: "16:9" as const,
    resolution: "1k" as const,
    mentions: payload.mentions.slice(0, 8),
  };
  return payload.references.length
    ? {
        workflowKind: "image.flux-reference",
        inputs: { ...base, references: payload.references.slice(0, 10) },
      }
    : { workflowKind: "image.flux", inputs: base };
}

/** Motion animates the approved keyframe, so the frame the creator chose is the first frame. */
export function motionRequest(
  shot: Shot,
  keyframe: AssetRef,
  elements: readonly Element[],
): GenerationRequest {
  const payload = mentionPayload(resolveMentions(shot.prompt, elements));
  return {
    workflowKind: "video.ltx",
    inputs: {
      prompt: composeShotPrompt(shot, { role: "motion" }),
      durationSeconds: shot.durationSeconds,
      resolution: "1280x720",
      fps: 24,
      generateAudio: false,
      quality: "fast",
      firstFrame: keyframe,
      mentions: payload.mentions.slice(0, 8),
    },
  };
}

/** Kling's reference video takes 3 to 10 seconds. */
const REFERENCE_DURATIONS = [3, 4, 5, 6, 8, 10] as const;

/**
 * Motion straight from the shot's words and its Elements' references, with no
 * keyframe: the references carry the picture (a Location's moving reference
 * carries the space around the camera), the frame, staging and camera fields
 * carry everything else. Null when nothing mentioned has a reference.
 */
export function referenceMotionRequest(
  shot: Shot,
  elements: readonly Element[],
): GenerationRequest | null {
  const mentions = resolveMentions(`${shot.prompt} ${shot.staging}`, elements);
  if (!mentions.some((m) => m.references.length || m.moves.length)) return null;
  const payload = mentionPayload(mentions);
  return {
    workflowKind: "video.reference",
    inputs: {
      prompt: composeShotPrompt(shot, { role: "motion" }),
      durationSeconds:
        REFERENCE_DURATIONS.find((d) => d >= shot.durationSeconds) ?? 10,
      aspectRatio: "16:9",
      mentions: payload.mentions.slice(0, 8),
    },
  };
}

/** A mentioned Location with a moving reference makes references the default. */
export function prefersReferenceMotion(
  shot: Shot,
  elements: readonly Element[],
): boolean {
  return resolveMentions(`${shot.prompt} ${shot.staging}`, elements).some(
    (m) => m.moves.length > 0,
  );
}

/** Shown on every new shot, so it reads as a hint, not a warning. */
export const EMPTY_FRAME_HINT =
  "Describe what the frame shows before generating.";

/** Problems worth saying before a creator spends on a shot. */
export function shotWarnings(shot: Shot, elements: readonly Element[]) {
  const warnings: string[] = [];
  const mentions = resolveMentions(shot.prompt, elements);
  const unknown = mentions
    .filter((m) => !m.element)
    .map((m) => `@${m.token.handle}`);
  if (unknown.length)
    warnings.push(
      `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not one of your Elements, so ${unknown.length === 1 ? "it reads" : "they read"} as plain words.`,
    );
  for (const m of mentions)
    if (m.blocking && m.problem)
      warnings.push(`${m.problem} The shot would generate without it.`);
  const bare = mentions.filter((m) => m.element && !m.references.length);
  if (bare.length)
    warnings.push(
      `${bare.map((m) => m.element!.name).join(", ")} ${bare.length === 1 ? "has" : "have"} no approved references yet, so the look may drift.`,
    );
  if ((shot.prompt || shot.beat).trim().length < 3)
    warnings.push(EMPTY_FRAME_HINT);
  return warnings;
}
