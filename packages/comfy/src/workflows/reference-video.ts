import {
  KLING_EDIT_LIMITS,
  replaceMentions,
  withDirection,
  type AssetRef,
  type ReferenceVideoInputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { characterReferences } from "./character-replace";
import { locationReferences } from "./background-replace";
import { expandMentions } from "./results";
import type { ProviderRequest } from "./types";

/**
 * `video.reference` runs on Kling 3.0 Omni's text-to-video, the one model the
 * Router offers that takes reference images and a reference video together
 * without a first frame. Router's LTX 2.5 reads text only.
 */
export const REFERENCE_VIDEO_MODEL = "kling/kling-v3-omni";

/**
 * Says the division of labour once: references are what things look like,
 * the words are where they are. Without it Kling copies the reference video's
 * framing and drops the staging.
 */
export const REFERENCE_RULE =
  "The references show only what the people and places look like. Take positions, which side the camera is on, its movement and the light from this description, not from the references.";

export interface ReferencePlan {
  /** One reference video per request: the first mentioned Location's move. */
  video: { mention: ResolvedMention; asset: AssetRef } | null;
  /** Reference images in order; `<<<image_N>>>` is `images[N - 1]`. */
  images: { mention: ResolvedMention; asset: AssetRef }[];
}

/**
 * Which references reach the model. Each Character brings its close portrait
 * (then its sheet), so faces come from the portrait; a Location brings its
 * moving reference as the video, or its best still when it has no move.
 * Kling takes four images beside a video.
 */
export function planReferences(
  mentions: readonly ResolvedMention[],
): ReferencePlan {
  const plan: ReferencePlan = { video: null, images: [] };
  const limit = KLING_EDIT_LIMITS.maxReferenceImages;
  for (const mention of mentions) {
    if (mention.type !== "location") continue;
    const move = mention.motion[0];
    if (move && !plan.video) plan.video = { mention, asset: move.asset };
  }
  // Characters first: a face is what drifts most without a reference.
  const ordered = [
    ...mentions.filter((m) => m.type === "character"),
    ...mentions.filter((m) => m.type === "thing"),
    ...mentions.filter((m) => m.type === "location"),
  ];
  for (const mention of ordered) {
    if (plan.images.length >= limit) break;
    if (plan.video?.mention === mention) continue;
    const refs =
      mention.type === "character"
        ? characterReferences(mention).slice(0, 2)
        : mention.type === "location"
          ? locationReferences(mention)
              .slice(0, 1)
              .map((asset) => ({ asset }))
          : mention.references.slice(0, 1);
    for (const ref of refs) {
      if (plan.images.length >= limit) break;
      plan.images.push({ mention, asset: ref.asset });
    }
  }
  return plan;
}

/**
 * The prompt for a reference shot. Each mention becomes its name and the
 * reference that shows it, so the picture comes from the asset and the
 * sentence around it says where it is and what it does. A mention with no
 * reference in the request is described in words instead, as for text-only
 * models.
 */
export function referenceVideoPrompt(
  inputs: Pick<ReferenceVideoInputs, "prompt" | "direction">,
  mentions: readonly ResolvedMention[],
  plan: ReferencePlan,
): string {
  const tokens = new Map<string, string[]>();
  plan.images.forEach(({ mention }, i) => {
    tokens.set(mention.elementId, [
      ...(tokens.get(mention.elementId) ?? []),
      `<<<image_${i + 1}>>>`,
    ]);
  });
  if (plan.video)
    tokens.set(plan.video.mention.elementId, [
      "<<<video_1>>>",
      ...(tokens.get(plan.video.mention.elementId) ?? []),
    ]);
  const pointed = mentions.filter((m) => tokens.has(m.elementId));
  const unpointed = mentions.filter((m) => !tokens.has(m.elementId));
  // Words for the mentions without a reference; names for the rest.
  const described = expandMentions(inputs.prompt, unpointed, "full");
  const text = replaceMentions(described, (token) => {
    const mention = pointed.find(
      (m) => m.handle.toLowerCase() === token.handle.toLowerCase(),
    );
    if (!mention) return token.raw;
    const shown = tokens.get(mention.elementId)!.join(" and ");
    const state = mention.stateName
      ? `, ${mention.stateName.toLowerCase()}${mention.stateDescription ? `: ${mention.stateDescription.trim().replace(/[.\s]+$/, "")}` : ""}`
      : "";
    return mention.type === "location"
      ? `${mention.name} (the place shown in ${shown}${state})`
      : `${mention.name} (as in ${shown}${state})`;
  });
  const directed = withDirection(text, inputs.direction, "video");
  const rule = pointed.length ? ` ${REFERENCE_RULE}` : "";
  // Kling reads at most 2,500 characters; the creator's words come first.
  return `${directed.slice(0, 2500 - rule.length)}${rule}`;
}

export interface ReferenceVideoMedia {
  /** The Location's move as an https URL; Kling fetches video by URL only. */
  videoUrl: string | null;
  /** Reference images as https URLs or bare base64, in plan order. */
  images: readonly string[];
}

export function referenceVideoRequest(
  inputs: ReferenceVideoInputs,
  prompt: string,
  media: ReferenceVideoMedia,
): ProviderRequest {
  return {
    model: REFERENCE_VIDEO_MODEL,
    input: {
      prompt,
      ...(media.images.length
        ? { image_list: media.images.map((image_url) => ({ image_url })) }
        : {}),
      ...(media.videoUrl
        ? {
            video_list: [
              {
                video_url: media.videoUrl,
                refer_type: "feature",
                keep_original_sound: "no",
              },
            ],
          }
        : {}),
      duration: String(inputs.durationSeconds),
      aspect_ratio: inputs.aspectRatio,
      // 720p standard mode, as measured for the Kling edits in Phase 0.
      mode: "std",
      sound: "off",
    },
  };
}
