import { z } from "zod";
import { formatCost, type CostUnit } from "@/features/settings/preferences";
import {
  preservedAspectSchema,
  type AssetRef,
  type GenerationEstimate,
  type GenerationRequest,
  type Job,
  type PreservedAspect,
  type Revision,
  type RevisionStatus,
} from "@open-cinema/contracts";

/** Browser-safe vocabulary for the revision studio. */
export type ReplacementKind = "background" | "character";

export const replacementKinds = {
  background: {
    kind: "background",
    workflowKind: "video.background-replace",
    label: "Replace background",
    verb: "Move this shot",
    changes: "The setting behind every person and Thing in the shot.",
  },
  character: {
    kind: "character",
    workflowKind: "video.character-replace",
    label: "Recast a character",
    verb: "Recast this shot",
    changes: "One person, face and body, with the wardrobe you choose.",
  },
} as const satisfies Record<
  ReplacementKind,
  {
    kind: ReplacementKind;
    workflowKind: GenerationRequest["workflowKind"];
    label: string;
    verb: string;
    changes: string;
  }
>;

export const preservedLabels: Record<PreservedAspect, string> = {
  performance: "Performance",
  timing: "Timing",
  camera: "Camera movement",
  framing: "Framing",
  foreground: "People and Things in front",
  background: "Background",
  "other-people": "Other people",
  things: "Unrelated Things",
  audio: "Original audio",
  wardrobe: "Wardrobe",
  lighting: "Lighting",
};

export const wardrobeIntents = {
  keep: {
    label: "Keep the source wardrobe",
    detail: "The new character wears what the original person wore.",
  },
  character: {
    label: "Use the character’s look",
    detail: "Wardrobe comes from the Character’s approved references.",
  },
  describe: {
    label: "Describe new wardrobe",
    detail: "Say what they wear; it applies to this shot only.",
  },
} as const;
export type WardrobeIntent = keyof typeof wardrobeIntents;

/**
 * What the creator decided, kept beside the revision so history can explain a
 * result. Elements live in the browser for now, so names travel with the ids.
 */
export const revisionDecisionsSchema = z.object({
  kind: z.enum(["background", "character"]),
  sourceTitle: z.string().max(300),
  element: z
    .object({
      id: z.string(),
      name: z.string(),
      handle: z.string(),
      stateName: z.string().nullable(),
      referenceCount: z.number().int().nonnegative(),
    })
    .nullable(),
  direction: z.string().max(2000),
  target: z.string().max(300),
  wardrobe: z.enum(["keep", "character", "describe"]).nullable(),
  wardrobeNote: z.string().max(500),
  preserve: z.array(preservedAspectSchema),
  allowIntegration: z.boolean(),
  estimate: z
    .object({ cost: z.string(), time: z.string(), basis: z.string() })
    .nullable(),
});
export type RevisionDecisions = z.infer<typeof revisionDecisionsSchema>;

export const revisionSubmissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  projectId: z.string().min(1).optional(),
  parentRevisionId: z.string().min(1).optional(),
  intent: z.string().trim().min(1).max(2000),
  request: z.unknown(),
  decisions: revisionDecisionsSchema,
});
export type RevisionSubmission = z.infer<typeof revisionSubmissionSchema>;

export function assetUrl(ref: AssetRef): string {
  return ref.type === "media-asset"
    ? `/api/media/${encodeURIComponent(ref.assetId)}`
    : `/api/jobs/output?job=${encodeURIComponent(ref.jobId)}&output=${encodeURIComponent(ref.outputId)}`;
}

export function posterUrl(ref: AssetRef): string | null {
  return ref.type === "media-asset"
    ? `/api/media/${encodeURIComponent(ref.assetId)}?variant=poster`
    : null;
}

/** The result a revision shows: its stored result, or the finished job's first video. */
export function revisionResult(
  revision: Pick<Revision, "result" | "jobId">,
  job: Job | undefined,
): AssetRef | null {
  if (revision.result) return revision.result;
  const output = job?.outputs.find(
    (o) => o.r2Key && o.mediaType.startsWith("video/"),
  );
  return output && job?.state === "succeeded"
    ? { type: "job-output", jobId: job.id, outputId: output.id }
    : null;
}

export type RevisionPhase =
  | "queued"
  | "generating"
  | "saving"
  | "ready"
  | "kept"
  | "rejected"
  | "failed"
  | "attention";

/** One honest phase from the stored revision and the live job, if any. */
export function revisionPhase(
  status: RevisionStatus,
  job: Job | undefined,
  hasResult: boolean,
): RevisionPhase {
  if (status === "kept" || status === "rejected") return status;
  if (status === "failed") return "failed";
  if (status === "proposed" || hasResult) return "ready";
  switch (job?.state) {
    case "failed":
    case "cancelled":
      return "failed";
    case "needs_attention":
      return "attention";
    case "persisting":
      return "saving";
    case "running":
    case "submitting":
    case "cancelling":
      return "generating";
    default:
      return "queued";
  }
}

export const phaseLabels: Record<RevisionPhase, string> = {
  queued: "Waiting to start",
  generating: "Generating",
  saving: "Saving result",
  ready: "Ready to review",
  kept: "Kept",
  rejected: "Rejected",
  failed: "Failed",
  attention: "Needs attention",
};

/**
 * Maps a moment in the source to the same moment in the result. Providers may
 * trim or retime a clip, so playback compares proportional positions.
 */
export function correspondingTime(
  time: number,
  fromDuration: number,
  toDuration: number,
) {
  if (!(fromDuration > 0) || !(toDuration > 0)) return time;
  return Math.min(toDuration, (time / fromDuration) * toDuration);
}

export function formatTimecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safe);
  const frames = Math.floor((safe - whole) * 25);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

/** Estimate copy in the creator's preferred cost unit. */
export function formatEstimate(estimate: GenerationEstimate, unit: CostUnit) {
  const minutes = (s: number) =>
    s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`;
  const { min, max } = estimate.seconds;
  const time =
    minutes(min) === minutes(max)
      ? minutes(max)
      : `${minutes(min)}–${minutes(max)}`;
  return {
    cost: estimate.credits
      ? formatCost(estimate.credits, unit)
      : "Price not published",
    time,
    basis:
      estimate.basis === "published-pricing"
        ? "From published pricing"
        : estimate.basis === "observed"
          ? "From recent runs"
          : "Rough estimate",
    note: estimate.note ?? null,
  };
}
