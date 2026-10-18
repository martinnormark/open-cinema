import type {
  BackgroundReplaceInputs,
  ResolvedMention,
} from "@open-cinema/contracts";
import { expandMentions, httpsUrl, mediaTypeFromUrl } from "./results";
import {
  CONFORM_STAGE,
  KLING_EDIT_LIMITS,
  LOCK_STAGE,
  revisionDirectionPrompt,
} from "@open-cinema/contracts";
import type {
  MediaStage,
  ProviderOutput,
  ProviderRequest,
  RouterStage,
} from "./types";

/**
 * The Router background replacement chosen in Phase 0 (docs/phase0-background.md).
 * Kling 3.0 Omni edits the source clip with the Location's reference images and
 * keeps the take's performance and camera path.
 */
export const BACKGROUND_REPLACE_MODEL = "kling/kling-v3-omni";

/** Establishing and layout views describe a place best; details last. */
const VIEW_ORDER = ["establishing", "alternate-angle", "landmark", "detail"];

/** The Location's approved references, best first. */
export function locationReferences(location: ResolvedMention | undefined) {
  if (!location) return [];
  const rank = (view: string | null) => {
    const i = view ? VIEW_ORDER.indexOf(view) : -1;
    return i === -1 ? VIEW_ORDER.length : i;
  };
  return [...location.references]
    .sort((a, b) => rank(a.view) - rank(b.view))
    .map((r) => r.asset);
}

/** "@Harbor at dusk" reads as "Harbor (dusk): <description>" to the model. */
function settingText(
  inputs: Pick<BackgroundReplaceInputs, "prompt">,
  location: ResolvedMention | undefined,
): string {
  const parts: string[] = [];
  if (location) {
    const state = location.stateName ? ` (${location.stateName})` : "";
    const details = [location.description, location.stateDescription]
      .filter(Boolean)
      .join(" ");
    parts.push(`${location.name}${state}${details ? `: ${details}` : ""}`);
  }
  if (inputs.prompt)
    parts.push(expandMentions(inputs.prompt, location ? [location] : []));
  // Callers end the setting with their own full stop.
  const text = parts.map((part) => part.trim().replace(/\.+$/, "")).join(". ");
  if (!text) throw new Error("Choose a Location or describe the new setting");
  return text;
}

/**
 * The edit instruction. Preservation is stated explicitly because both models
 * treat unstated aspects as editable; integration (light on the subjects) is
 * allowed only when the creator allowed it.
 */
export function backgroundEditPrompt(
  inputs: Pick<BackgroundReplaceInputs, "prompt" | "preservation"> &
    Partial<Pick<BackgroundReplaceInputs, "direction">>,
  location: ResolvedMention | undefined,
  referenceToken: string | null,
): string {
  const setting = settingText(inputs, location);
  const reference = referenceToken
    ? ` Use the place shown in ${referenceToken} as the new setting.`
    : "";
  const light = inputs.preservation.allowIntegration
    ? "Adjust light and shadows on the people only as needed to sit naturally in the new setting."
    : "Do not change the lighting or colour of the people or the objects they touch.";
  const look = revisionDirectionPrompt(inputs.direction);
  return (
    `Replace only the background and setting with ${setting}.${reference} ` +
    (look ? `${look} ` : "") +
    "Keep every person and every object they hold or touch exactly as in the source: same faces, hair, " +
    "clothing, poses, gestures, expressions and timing. Keep the camera movement, framing and lens identical. " +
    light
  ).slice(0, 2500);
}

export interface BackgroundRequestMedia {
  /** Short-lived https URL of the source clip; Kling fetches video by URL. */
  videoUrl: string;
  /** Location references as https URLs or `data:` URIs, best first. */
  referenceImages: readonly string[];
}

/** Kling 3.0 Omni video edit: the source is `<<<video_1>>>`, references `<<<image_N>>>`. */
export function klingBackgroundRequest(
  inputs: Pick<BackgroundReplaceInputs, "prompt" | "preservation"> &
    Partial<Pick<BackgroundReplaceInputs, "direction">>,
  location: ResolvedMention | undefined,
  media: BackgroundRequestMedia,
): ProviderRequest {
  const images = media.referenceImages.slice(
    0,
    KLING_EDIT_LIMITS.maxReferenceImages,
  );
  const token = images.length
    ? images.map((_, i) => `<<<image_${i + 1}>>>`).join(" and ")
    : null;
  return {
    model: BACKGROUND_REPLACE_MODEL,
    input: {
      prompt: backgroundEditPrompt(inputs, location, token).replace(
        "Replace only the background",
        "Replace only the background of <<<video_1>>>",
      ),
      video_list: [
        {
          video_url: media.videoUrl,
          refer_type: "base",
          keep_original_sound: inputs.preservation.preserve.includes("audio")
            ? "yes"
            : "no",
        },
      ],
      ...(images.length
        ? { image_list: images.map((image_url) => ({ image_url })) }
        : {}),
      // Phase 0 measured 720p standard mode; pro (1080p) is untested.
      mode: "std",
      sound: "off",
    },
  };
}

/**
 * Seedance 2.5 video edit relocates the whole shot: ground, sky and set are
 * rebuilt along the take's own camera path, which Kling's edit does not hold
 * once the camera pans (docs/moving-scenes.md). The take is `[Video 1]`, the
 * Location's references `[Image N]`.
 */
export const SEEDANCE_RELOCATE_MODEL = "byteplus/dreamina-seedance-2-5-260628";
/** Seedance reads up to nine reference images; the best few describe a place. */
const SEEDANCE_MAX_REFERENCES = 3;

export function seedanceRelocatePrompt(
  inputs: Pick<BackgroundReplaceInputs, "prompt" | "preservation"> &
    Partial<Pick<BackgroundReplaceInputs, "direction">>,
  location: ResolvedMention | undefined,
  references: number,
): string {
  const setting = settingText(inputs, location);
  const tags = Array.from(
    { length: references },
    (_, i) => `[Image ${i + 1}]`,
  ).join(" and ");
  const look = revisionDirectionPrompt(inputs.direction);
  const light = inputs.preservation.allowIntegration
    ? "Light the people as the new place would."
    : "Do not change the lighting or colour of the people or the objects they touch.";
  return [
    `Move the scene in [Video 1] to ${setting}.`,
    tags ? `The new place is the one shown in ${tags}.` : "",
    "Rebuild the ground, the background and everything around the people as that place.",
    look,
    "Keep every person, their clothes, their exact performance and timing, everyone who passes through, and the camera movement exactly as in [Video 1].",
    light,
    "Photorealistic.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2500);
}

export interface SeedanceRelocateMedia {
  /** Short-lived https URL of the source clip; Seedance fetches video by URL. */
  videoUrl: string;
  /** Location references as https URLs or `data:` URIs, best first. */
  referenceImages: readonly string[];
}

export function seedanceRelocateRequest(
  inputs: Pick<BackgroundReplaceInputs, "prompt" | "preservation"> &
    Partial<Pick<BackgroundReplaceInputs, "direction">>,
  location: ResolvedMention | undefined,
  media: SeedanceRelocateMedia,
): ProviderRequest {
  const images = media.referenceImages.slice(0, SEEDANCE_MAX_REFERENCES);
  return {
    model: SEEDANCE_RELOCATE_MODEL,
    input: {
      content: [
        {
          type: "text",
          text: seedanceRelocatePrompt(inputs, location, images.length),
        },
        {
          type: "video_url",
          video_url: { url: media.videoUrl },
          role: "reference_video",
        },
        ...images.map((url) => ({
          type: "image_url",
          image_url: { url },
          role: "reference_image",
        })),
      ],
      // An edit keeps the source's length and aspect; only -1 is accepted.
      duration: -1,
      resolution: "720p",
      // The conform step carries the take's own audio.
      generate_audio: false,
      watermark: false,
    },
  };
}

/** Seedance returns the clip at `content.video_url`, re-hosted by Router. */
export function seedanceRelocateOutputs(data: unknown): ProviderOutput[] {
  const url = httpsUrl(at(data, "content", "video_url"));
  return url ? [{ providerAssetId: "video", url, mediaType: "video/mp4" }] : [];
}

/**
 * Seedance returns 24 fps and can end a few frames early (193 of 201 on one
 * run of the street take, all 201 on the next), so the edit is put on the source's frame grid with its audio;
 * a short edit holds its last frame. It is not stretched: Seedance retimes
 * unevenly (it dropped the take's closing tilt), so a uniform stretch would
 * not line it up either.
 */
export const relocateConformStage: MediaStage<"video.background-replace"> = {
  kind: "media",
  id: CONFORM_STAGE,
  label: "Matching the source frame rate",
  deadlineMs: 20 * 60_000,
  tasks(inputs, context) {
    const editId = context.saved.find((id) => !id.includes(":"));
    const edit = editId ? context.output(editId) : null;
    if (!edit) throw new Error("The relocated edit is missing");
    return [
      {
        output: "video",
        operation: "conform",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
        ],
      },
    ];
  },
};

function at(value: unknown, ...path: (string | number)[]): unknown {
  let v = value;
  for (const key of path) {
    if (!v || typeof v !== "object") return null;
    v = (v as Record<string | number, unknown>)[key];
  }
  return v;
}

/** Kling returns the edited clip at `data.task_result.videos[0].url`. */
export function backgroundReplaceOutputs(data: unknown): ProviderOutput[] {
  const kling = at(data, "data", "task_result", "videos", 0);
  const url = httpsUrl(at(kling, "url"));
  return url
    ? [
        {
          providerAssetId: String(at(kling, "id") ?? "video"),
          url,
          mediaType: mediaTypeFromUrl(url, "video/mp4"),
        },
      ]
    : [];
}

/**
 * The foreground lock (docs/phase0-background.md, docs/background-job.md).
 * Kling relights the performers and returns 24 fps up to two frames short, so
 * after the edit the job mattes the source performers and then, in the media
 * container, composites them over the edit on the source's own frame grid with
 * the source audio (the locked variant). The edit is conformed the same way as
 * the unlocked variant for takes where Kling's relight reads better.
 */
export const BACKGROUND_MATTE_MODEL = "bria/video-edit-remove-background";
export const MATTE_STAGE = "matte";

/** Bria's transparent VP9 keeps a soft alpha edge; its result is at `result.video_url`. */
export function backgroundMatteRequest(videoUrl: string): ProviderRequest {
  return {
    model: BACKGROUND_MATTE_MODEL,
    input: {
      video: videoUrl,
      background_color: "Transparent",
      output_container_and_codec: "webm_vp9",
      preserve_audio: false,
    },
  };
}

export function backgroundMatteOutputs(data: unknown): ProviderOutput[] {
  const url = httpsUrl(at(data, "result", "video_url"));
  return url
    ? [
        {
          providerAssetId: "video",
          url,
          mediaType: mediaTypeFromUrl(url, "video/webm"),
        },
      ]
    : [];
}

export const backgroundMatteStage: RouterStage<"video.background-replace"> = {
  kind: "router",
  id: MATTE_STAGE,
  label: "Matting the performers",
  model: BACKGROUND_MATTE_MODEL,
  deadlineMs: 30 * 60_000,
  async build(inputs, context) {
    const source = await context.asset(inputs.source);
    return backgroundMatteRequest(await source.fetchableUrl());
  },
  outputs: backgroundMatteOutputs,
};

export const backgroundLockStage: MediaStage<"video.background-replace"> = {
  kind: "media",
  id: LOCK_STAGE,
  label: "Locking the performers to the take",
  deadlineMs: 20 * 60_000,
  tasks(inputs, context) {
    // The edit is the first request's output; later stages store `{stage}:{asset}`.
    const editId = context.saved.find((id) => !id.includes(":"));
    const edit = editId ? context.output(editId) : null;
    const matte = context.output(`${MATTE_STAGE}:video`);
    if (!edit || !matte) throw new Error("The edit or its matte is missing");
    return [
      {
        output: "locked",
        operation: "lock",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
          { name: "matte", ref: matte },
        ],
      },
      {
        output: "unlocked",
        operation: "conform",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
        ],
      },
    ];
  },
};
