import type {
  CameraMove,
  DirectionSnapshot,
  GenerationRequest,
  ImageAspectRatio,
  Look,
  ShotDirection,
} from "@open-cinema/contracts";
import { mentionPayload, type useMentions } from "@/features/elements/mentions";

export type Medium = "image" | "video";

/** Whether a video can take its picture from the mentioned Elements' references. */
export function canUseReferences(mentions: ReturnType<typeof useMentions>) {
  return mentions.some(
    (m) => m.element && (m.references.length > 0 || m.moves.length > 0),
  );
}

/**
 * A Location with a moving reference makes references the default: the clip
 * shows the space around the camera, which no wording of LTX's can match.
 */
export function prefersReferences(mentions: ReturnType<typeof useMentions>) {
  return mentions.some((m) => m.element && m.moves.length > 0);
}

/**
 * Video is LTX 2.5 text-to-video: a short, 720p clip keeps the first take cheap.
 * Mentions with approved references condition Flux; otherwise a plain image.
 */
export function studioRequest(
  prompt: string,
  mentions: ReturnType<typeof useMentions>,
  medium: Medium,
  aspectRatio: ImageAspectRatio,
  direction: DirectionSnapshot | undefined,
  camera: CameraMove | null = null,
  durationSeconds?: 4 | 5 | 6 | 8 | 10,
  fromReferences = false,
): GenerationRequest {
  const payload = mentionPayload(mentions);
  const directed = direction ? { direction } : {};
  // The references carry the picture; the prompt carries the staging.
  if (medium === "video" && fromReferences)
    return {
      workflowKind: "video.reference",
      inputs: {
        prompt: prompt.trim(),
        durationSeconds: durationSeconds ?? 5,
        aspectRatio: "16:9",
        mentions: payload.mentions.slice(0, 8),
        ...directed,
      },
    };
  if (medium === "video")
    return {
      workflowKind: "video.ltx",
      inputs: {
        prompt: prompt.trim(),
        // A camera move runs on a Cloud GPU billed by time; four seconds
        // show the move and keep the run short.
        durationSeconds: camera ? 4 : (durationSeconds ?? 6),
        ...(camera ? { camera } : {}),
        resolution: "1280x720",
        fps: 25,
        generateAudio: true,
        quality: "fast",
        mentions: payload.mentions.slice(0, 8),
        ...directed,
      },
    };
  const base = {
    prompt: prompt.trim(),
    aspectRatio,
    resolution: "1k" as const,
    mentions: payload.mentions.slice(0, 8),
    ...directed,
  };
  return payload.references.length
    ? {
        workflowKind: "image.flux-reference",
        inputs: { ...base, references: payload.references.slice(0, 10) },
      }
    : { workflowKind: "image.flux", inputs: base };
}

/** The direction a studio shot carries: its look, shot choices and recipe. */
export function studioDirection(
  overrides: Look,
  shot: ShotDirection,
  recipe: { id: string; version: number; name: string } | null,
): DirectionSnapshot | undefined {
  const any =
    recipe ||
    Object.keys(overrides).length > 0 ||
    Object.values(shot).some(Boolean);
  if (!any) return undefined;
  return {
    overrides,
    shot,
    ...(recipe ? { recipe } : {}),
  };
}
