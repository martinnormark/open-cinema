import type {
  BackgroundReplaceInputs,
  ResolvedMention,
} from "@open-cinema/contracts";
import { expandMentions, httpsUrl, mediaTypeFromUrl } from "./results";
import { LOCK_STAGE, revisionDirectionPrompt } from "@open-cinema/contracts";
import type {
  MediaStage,
  ProviderOutput,
  ProviderRequest,
  RouterStage,
} from "./types";

/**
 * Background replacement pipelines measured in Phase 0 (docs/phase0-background.md).
 * Kling 3.0 Omni edits the source clip with the Location's reference images and
 * keeps the take's performance and camera path; SwitchX keeps the matted subject,
 * regenerates the rest from one reference, and returns its matte.
 */
export const BACKGROUND_REPLACE_MODELS = {
  kling: "kling/kling-v3-omni",
  switchx: "beeble/switchx",
} as const;
export type BackgroundPipeline = keyof typeof BACKGROUND_REPLACE_MODELS;
export const DEFAULT_BACKGROUND_PIPELINE: BackgroundPipeline = "kling";

/** Kling's video-edit limits (Router schema, 2026-10-16). */
export const KLING_EDIT_LIMITS = {
  minSeconds: 3,
  maxSeconds: 10,
  minSidePx: 720,
  maxReferenceImages: 4,
} as const;
/** SwitchX accepts at most 240 frames of up to ~2.77 MP each. */
export const SWITCHX_MAX_FRAMES = 240;

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
  const text = parts.join(". ").trim();
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
  /** Short-lived https URL of the source clip; both models fetch video by URL. */
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
    model: BACKGROUND_REPLACE_MODELS.kling,
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

/** SwitchX: keeps the auto-matted subject (or a supplied matte) and regenerates the rest. */
export function switchxBackgroundRequest(
  inputs: Pick<BackgroundReplaceInputs, "prompt" | "preservation">,
  location: ResolvedMention | undefined,
  media: BackgroundRequestMedia & { matteUrl?: string | undefined },
): ProviderRequest {
  const [reference] = media.referenceImages;
  return {
    model: BACKGROUND_REPLACE_MODELS.switchx,
    input: {
      generation_type: "video",
      source_uri: media.videoUrl,
      alpha_mode: media.matteUrl ? "custom" : "auto",
      ...(media.matteUrl ? { alpha_uri: media.matteUrl } : {}),
      ...(reference ? { reference_image_uri: reference } : {}),
      prompt:
        `The same people, unchanged, in ${settingText(inputs, location)}.`.slice(
          0,
          2000,
        ),
      max_resolution: 1080,
    },
  };
}

function at(value: unknown, ...path: (string | number)[]): unknown {
  let v = value;
  for (const key of path) {
    if (!v || typeof v !== "object") return null;
    v = (v as Record<string | number, unknown>)[key];
  }
  return v;
}

/**
 * Kling returns `data.task_result.videos[0].url`; SwitchX returns `output.render`
 * plus the matte it used at `output.alpha`, kept so a revision can be refined or
 * composited later without matting again.
 */
export function backgroundReplaceOutputs(data: unknown): ProviderOutput[] {
  const kling = at(data, "data", "task_result", "videos", 0);
  const klingUrl = httpsUrl(at(kling, "url"));
  if (klingUrl) {
    return [
      {
        providerAssetId: String(at(kling, "id") ?? "video"),
        url: klingUrl,
        mediaType: mediaTypeFromUrl(klingUrl, "video/mp4"),
      },
    ];
  }
  const render = httpsUrl(at(data, "output", "render"));
  if (!render) return [];
  const outputs: ProviderOutput[] = [
    {
      providerAssetId: "render",
      url: render,
      mediaType: mediaTypeFromUrl(render, "video/mp4"),
    },
  ];
  const alpha = httpsUrl(at(data, "output", "alpha"));
  if (alpha) {
    outputs.push({
      providerAssetId: "alpha",
      url: alpha,
      mediaType: mediaTypeFromUrl(alpha, "video/mp4"),
    });
  }
  return outputs;
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
