import type {
  CameraMove,
  DirectionSnapshot,
  GenerationRequest,
  ImageAspectRatio,
  Look,
  Project,
  ShotDirection,
} from "@open-cinema/contracts";
import { mentionPayload, type useMentions } from "@/features/elements/mentions";

export type Medium = "image" | "video";

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
): GenerationRequest {
  const payload = mentionPayload(mentions);
  const directed = direction ? { direction } : {};
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

/**
 * The direction a studio shot carries. The project look shown here is a
 * preview; the server records the project's current look at submission.
 */
export function studioDirection(
  project: Project | null,
  overrides: Look,
  shot: ShotDirection,
  recipe: { id: string; version: number; name: string } | null,
): DirectionSnapshot | undefined {
  const any =
    project ||
    recipe ||
    Object.keys(overrides).length > 0 ||
    Object.values(shot).some(Boolean);
  if (!any) return undefined;
  return {
    ...(project
      ? { project: { id: project.id, name: project.name, look: project.look } }
      : {}),
    overrides,
    shot,
    ...(recipe ? { recipe } : {}),
  };
}
