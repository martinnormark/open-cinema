/**
 * Copy the moves on Wan: a clip supplies the motion and a Character performs
 * it, by Wan 3.0 on Router or Wan Animate 2 on Comfy Cloud. The LTX 2.3 path
 * this replaced is ./ltx-performance-transfer.ts. docs/copy-the-moves.md has
 * the runs.
 */

import {
  MOTION_ENGINES,
  type AssetRef,
  type MotionResolution,
  type PerformanceTransferInputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { characterReferences, referenceGuide } from "./character-replace";
import { locationReferences } from "./background-replace";
import { mediaFilename, seedFrom } from "./ltx-alpha-background";
import { expandMentions, httpsUrl } from "./results";
import {
  WAN_ANIMATE_MEDIA_INPUTS,
  WAN_ANIMATE_MODEL_ID,
  wanAnimateGraph,
  type WanAnimateSize,
} from "./wan-animate";
import type {
  BuildContext,
  CloudMediaInput,
  CloudWorkflowRequest,
  MediaStage,
  ProviderOutput,
  ProviderRequest,
} from "./types";

export const WAN3_MODEL = MOTION_ENGINES["wan-3"].modelId;

/** Character views first (portrait, then sheet), then the Location's. */
const MAX_CHARACTER_IMAGES = 3;
const MAX_LOCATION_IMAGES = 2;
/**
 * Wan 3.0 reads up to ten reference images, but Router timed out every
 * three-swap run that sent nine inline (2026-10-22); six by URL finished in
 * six minutes. Swaps send at most this many.
 */
const MAX_CAST_IMAGES = 6;

const clean = (text: string) => text.trim().replace(/[.\s]+$/, "");
const sentence = (text: string) => {
  const t = clean(text);
  return t ? `${t[0]!.toUpperCase()}${t.slice(1)}.` : "";
};
const list = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)!}`;

/** Who, from the Character's description and state, without the name. */
function identity(character: ResolvedMention) {
  return [character.description, character.stateDescription]
    .filter(Boolean)
    .map((t) => clean(t!))
    .join("; ");
}

function find(context: BuildContext, id: string | undefined) {
  return id ? context.mentions.find((m) => m.elementId === id) : undefined;
}

/** The Character and Location the inputs name, checked. */
export function movesCast(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
) {
  const character = find(
    context,
    inputs.character?.elementId ?? inputs.cast[0]?.character.elementId,
  );
  const location = find(context, inputs.location?.elementId);
  if (!character || character.type !== "character")
    throw new Error("Choose the Character who performs the moves");
  return { character, location };
}

/** Each tagged person with the Character who takes their place, checked. */
export function movesSwaps(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
) {
  return inputs.cast.map((swap) => {
    const character = find(context, swap.character.elementId);
    if (!character || character.type !== "character")
      throw new Error(`Choose who @person${swap.person} becomes`);
    return { ...swap, character };
  });
}

/** `@person2` in the creator's words reads "Person 2", as the instruction names them. */
export const namePeople = (text: string) =>
  text.replace(/@person([1-9])\b/gi, "Person $1");

/** The creator's extra words, with mentions spelled out; empty when they only named the cast. */
function extraDirection(
  inputs: PerformanceTransferInputs,
  mentions: readonly ResolvedMention[],
  names: readonly string[],
) {
  const words = clean(namePeople(expandMentions(inputs.prompt, mentions)));
  // "@Cal copies the moves" adds nothing the instruction does not say already.
  const bare = names.reduce(
    (text, name) => text.replaceAll(name, ""),
    words.toLowerCase(),
  );
  return /^[\s,.]*(copies|copy|does|performs)?\s*(the|these)?\s*(moves|dance)?[\s,.]*$/i.test(
    bare,
  )
    ? ""
    : sentence(words);
}

export interface Wan3MovesMedia {
  /** Short-lived https URL of the clip; Wan reads reference video by URL only. */
  videoUrl: string;
  /** Character then Location images, as https URLs or `data:` URIs. */
  images: readonly string[];
}

/**
 * Wan 3.0's reference mode names its media in order: Video 1, Image 1, … The
 * instruction is the short form creators use with it ("swap the dancer in
 * Video 1 for the man in Image 1, use the background from Image 3"), plus who
 * the Character is, so a headless sheet reads as an outfit.
 */
export function wan3MovesPrompt(o: {
  performer: string | undefined;
  character: ResolvedMention;
  characterImages: readonly {
    view: ResolvedMention["references"][number]["view"];
  }[];
  location: ResolvedMention | undefined;
  locationImages: number;
  direction: string;
}) {
  const name = o.character.name;
  const tag = (i: number) => `Image ${i + 1}`;
  const faces = o.characterImages.map((_, i) => tag(i));
  const who = identity(o.character);
  const places = Array.from({ length: o.locationImages }, (_, i) =>
    tag(o.characterImages.length + i),
  );
  const performer = clean(o.performer ?? "") || "the person";
  const setting = o.location
    ? `Use the place from ${list(places) || "the description"}: ${o.location.name}${o.location.description ? `, ${clean(o.location.description)}` : ""}. Light ${name} as that place would.`
    : "Keep the place, the light and everyone else exactly as in Video 1.";
  return [
    `Swap ${performer} in Video 1 for ${name}, the person shown in ${list(faces)}${who ? `: ${who}` : ""}.`,
    referenceGuide(
      o.characterImages.map((image, i) => ({ tag: tag(i), view: image.view })),
    ),
    setting,
    `${name} copies every step, gesture and expression of Video 1 with the same timing, the same camera framing and the same camera movement.`,
    o.direction,
    "Photorealistic.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);
}

/** Where a click sits on the frame, in words: "on the right", "in the middle, near the top". */
export function frameSpot(point: { x: number; y: number }) {
  const across =
    point.x < 0.36
      ? "on the left"
      : point.x > 0.64
        ? "on the right"
        : "in the middle";
  const down =
    point.y < 0.33
      ? ", near the top"
      : point.y > 0.67
        ? ", near the bottom"
        : "";
  return `${across}${down}`;
}

/**
 * Several swaps in one run. Each tagged person is shown to Wan as a cut-out
 * from the clip ("the person in Image 1"), then the Character's views, so
 * nobody has to describe who is who in words.
 */
export function wan3CastPrompt(o: {
  swaps: readonly {
    person: number;
    character: ResolvedMention;
    point: { x: number; y: number; timeMs: number };
    /** The cut-out's image number, or null when none was sent. */
    crop: number | null;
    /** The Character's image numbers and views, in order. */
    images: readonly {
      n: number;
      view: ResolvedMention["references"][number]["view"];
    }[];
  }[];
  location: ResolvedMention | undefined;
  locationImages: readonly number[];
  direction: string;
}) {
  const tag = (n: number) => `Image ${n}`;
  const lines = o.swaps.map((swap) => {
    const where = `${frameSpot(swap.point)} of the frame at ${(swap.point.timeMs / 1000).toFixed(1)} s`;
    const who = identity(swap.character);
    const seen =
      swap.crop === null
        ? `the person ${where}`
        : `the person shown in ${tag(swap.crop)} (${where})`;
    return [
      `Person ${swap.person}, ${seen}, becomes ${swap.character.name}, shown in ${list(swap.images.map((i) => tag(i.n)))}${who ? `: ${who}` : ""}.`,
      referenceGuide(swap.images.map((i) => ({ tag: tag(i.n), view: i.view }))),
    ]
      .filter(Boolean)
      .join(" ");
  });
  const crops = o.swaps.flatMap((s) => (s.crop === null ? [] : [tag(s.crop)]));
  const setting = o.location
    ? `Use the place from ${list(o.locationImages.map(tag)) || "the description"}: ${o.location.name}${o.location.description ? `, ${clean(o.location.description)}` : ""}. Light everyone as that place would.`
    : "Keep the place, the light and everyone else exactly as in Video 1.";
  return [
    `In Video 1, swap ${o.swaps.length === 1 ? "one person" : `${o.swaps.length} people`} and leave everyone else exactly as filmed.`,
    ...lines,
    crops.length
      ? `${list(crops)} ${crops.length === 1 ? "is a still" : "are stills"} from Video 1 that only point out who to replace; take nobody's face, hair or clothes from ${crops.length === 1 ? "it" : "them"}.`
      : "",
    setting,
    "Each of them copies every step, gesture and expression of the person they replace, with the same timing, the same camera framing and the same camera movement as Video 1.",
    o.direction,
    "Photorealistic.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);
}

/** Wan 3.0's resolution tiers, in its own spelling. */
const WAN3_RESOLUTION: Record<MotionResolution, string> = {
  "480p": "480P",
  "720p": "720P",
  "1080p": "1080P",
};

/** Inline when Wan may take it so; the clip itself always goes by URL. */
async function imageUrl(context: BuildContext, ref: AssetRef) {
  const asset = await context.asset(ref);
  return asset.publicUrl ?? (await asset.dataUri());
}

/** Several tagged people, each with their own Character. */
async function wan3CastMedia(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
  location: ResolvedMention | undefined,
) {
  const swaps = movesSwaps(inputs, context);
  const crops = swaps.filter((s) => s.crop).length;
  const placeRefs = location
    ? locationReferences(location).slice(
        0,
        Math.max(
          0,
          Math.min(MAX_LOCATION_IMAGES, MAX_CAST_IMAGES - crops - swaps.length),
        ),
      )
    : [];
  // The cut-outs, then as many views per Character as fit.
  const perCharacter = Math.max(
    1,
    Math.min(
      MAX_CHARACTER_IMAGES,
      Math.floor((MAX_CAST_IMAGES - crops - placeRefs.length) / swaps.length),
    ),
  );
  const refs: AssetRef[] = [];
  const planned = swaps.map((swap) => {
    const ordered = characterReferences(swap.character);
    // One view each: the sheet, whose large portrait also carries the face.
    const views =
      perCharacter === 1
        ? [ordered.find((r) => r.view === "sheet") ?? ordered[0]].filter(
            (r) => r !== undefined,
          )
        : ordered.slice(0, perCharacter);
    if (!views.length)
      throw new Error(
        `${swap.character.name} needs an approved reference first`,
      );
    let crop: number | null = null;
    if (swap.crop) {
      refs.push(swap.crop);
      crop = refs.length;
    }
    const images = views.map((view) => {
      refs.push(view.asset);
      return { n: refs.length, view: view.view };
    });
    return { ...swap, crop, images };
  });
  const locationImages = placeRefs.map((ref) => {
    refs.push(ref);
    return refs.length;
  });
  // By URL: inline sheets made the request tens of megabytes.
  const images = await Promise.all(
    refs.map(async (ref) => {
      const asset = await context.asset(ref);
      return asset.publicUrl ?? (await asset.fetchableUrl());
    }),
  );
  const prompt = wan3CastPrompt({
    swaps: planned,
    location,
    locationImages,
    direction: extraDirection(
      inputs,
      context.mentions,
      [...swaps.map((s) => s.character.name), location?.name ?? ""].filter(
        Boolean,
      ),
    ),
  });
  return { images, prompt };
}

export async function wan3MovesRequest(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
): Promise<ProviderRequest> {
  const { character, location } = movesCast(inputs, context);
  const source = await context.asset(inputs.source);
  if (!source.mediaType.startsWith("video/"))
    throw new Error("Choose a video clip whose moves to copy");
  const videoUrl = await source.fetchableUrl();
  const { images, prompt } = inputs.cast.length
    ? await wan3CastMedia(inputs, context, location)
    : await wan3SoloMedia(inputs, context, character, location);
  return wan3Body(inputs, videoUrl, images, prompt);
}

/** One Character in place of the performer, as worded or the only person. */
async function wan3SoloMedia(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
  character: ResolvedMention,
  location: ResolvedMention | undefined,
) {
  const characterRefs = characterReferences(character).slice(
    0,
    MAX_CHARACTER_IMAGES,
  );
  if (!characterRefs.length)
    throw new Error(`${character.name} needs an approved reference first`);
  const placeRefs = location
    ? locationReferences(location).slice(0, MAX_LOCATION_IMAGES)
    : [];
  // Images may go inline; the clip may not.
  const images = await Promise.all(
    [...characterRefs.map((r) => r.asset), ...placeRefs].map((ref) =>
      imageUrl(context, ref),
    ),
  );
  const prompt = wan3MovesPrompt({
    performer: inputs.performer,
    character,
    characterImages: characterRefs,
    location,
    locationImages: placeRefs.length,
    direction: extraDirection(
      inputs,
      context.mentions,
      [character.name, location?.name ?? ""].filter(Boolean),
    ),
  });
  return { images, prompt };
}

function wan3Body(
  inputs: PerformanceTransferInputs,
  videoUrl: string,
  images: readonly string[],
  prompt: string,
): ProviderRequest {
  return {
    model: WAN3_MODEL,
    input: {
      input: {
        prompt,
        media: [
          { type: "reference_video", url: videoUrl },
          ...images.map((url) => ({ type: "reference_image", url })),
        ],
      },
      parameters: {
        resolution: WAN3_RESOLUTION[inputs.resolution],
        // The clip's own length; Wan bills its input seconds as well.
        duration: wan3Duration(inputs.seconds),
        ratio: "adaptive",
        // The words are ours on purpose; Wan's rewriting drifted from the clip.
        prompt_extend: false,
        // The dub stage lays the clip's own sound over the result.
        audio: false,
        watermark: false,
        // Wan takes a 31-bit seed and refuses the request (422) above it.
        seed:
          seedFrom(JSON.stringify([inputs.source, inputs.prompt])) % 2 ** 31,
      },
    },
  };
}

/** Whole seconds within Wan's range; -1 lets Wan match the clip when unknown. */
export function wan3Duration(seconds: number | undefined) {
  if (seconds === undefined) return -1;
  return Math.min(
    MOTION_ENGINES["wan-3"].maxSeconds,
    Math.max(2, Math.round(seconds)),
  );
}

/** Wan returns `output.video_url`, a link valid for 24 hours. */
export function wan3MovesOutputs(data: unknown): ProviderOutput[] {
  const output =
    data && typeof data === "object" && "output" in data ? data.output : null;
  const url = httpsUrl(
    output && typeof output === "object" && "video_url" in output
      ? output.video_url
      : null,
  );
  return url ? [{ providerAssetId: "video", url, mediaType: "video/mp4" }] : [];
}

export const DUB_STAGE = "dub";

/** The result at its own size and rate, with the clip's sound: dances keep their music. */
export const movesDubStage: MediaStage<"video.performance-transfer"> = {
  kind: "media",
  id: DUB_STAGE,
  label: "Adding the clip's sound",
  deadlineMs: 20 * 60_000,
  tasks(inputs, context) {
    const editId = context.saved.find((id) => !id.includes(":"));
    const edit = editId ? context.output(editId) : null;
    if (!edit) throw new Error("The new performance is missing");
    return [
      {
        output: "video",
        operation: "dub",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
        ],
      },
    ];
  },
};

/**
 * FLUX 3 Klein's instruction for the opening frame: the performer becomes the
 * Character in the same pose, and the place stays or becomes the Location.
 */
export function moveKeyframePrompt(o: {
  performer: string | undefined;
  character: ResolvedMention;
  images: number;
  location: ResolvedMention | undefined;
  locationImages: number;
}) {
  const ordinals = ["second", "third", "fourth", "fifth", "sixth"];
  const names = (from: number, count: number) =>
    list(ordinals.slice(from, from + count).map((o) => `the ${o} image`));
  const who = identity(o.character);
  const performer = clean(o.performer ?? "") || "the person";
  const place = o.location
    ? `Change the place into ${o.location.name}${o.location.description ? `, ${clean(o.location.description)}` : ""}${o.locationImages ? `, as shown in ${names(o.images, o.locationImages)}` : ""}, seen from the same camera angle, lit to match.`
    : "Change nothing else: everyone else, the background, the floor and the framing stay exactly as they are.";
  return [
    `In the first image, replace ${performer} with ${o.character.name}, the person shown in ${names(0, o.images)}${who ? `: ${who}` : ""}.`,
    "Keep their exact position, scale, pose, body angle, head direction and gesture from the first image, lit by the scene's own light.",
    place,
  ].join(" ");
}

/** Wan Animate 2's text: who is moving and where, never the motion itself. */
export function wanAnimatePrompt(
  character: ResolvedMention,
  location: ResolvedMention | undefined,
  direction: string,
) {
  const who = identity(character);
  return [
    `Character description: ${character.name}${who ? `, ${who}` : ""}, moving exactly as in the reference motion.`,
    location
      ? `Background description: ${location.name}${location.description ? `, ${clean(location.description)}` : ""}.`
      : "Background description: the same place as the first frame.",
    direction,
  ]
    .filter(Boolean)
    .join("\n");
}

const WAN_ANIMATE_SIZE: Record<MotionResolution, WanAnimateSize> = {
  "480p": "draft",
  "720p": "standard",
  // Wan Animate 2's distill LoRA is trained at 480p; 960 px is as far as it holds.
  "1080p": "standard",
};

export async function wanAnimateMovesRequest(
  inputs: PerformanceTransferInputs,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  if (inputs.cast.length)
    throw new Error("Tagged people need Wan 3.0; Wan Animate 2 copies one");
  const { character, location } = movesCast(inputs, context);
  // The portrait for the face, the sheet for the body and outfit.
  const characterRefs = characterReferences(character)
    .slice(0, 2)
    .map((r) => r.asset);
  if (!characterRefs.length && !inputs.firstFrame)
    throw new Error(`${character.name} needs an approved reference first`);
  const placeRefs = location ? locationReferences(location).slice(0, 1) : [];
  const refs = inputs.firstFrame ? [] : [...characterRefs, ...placeRefs];
  const [source, keyframe, ...references] = await Promise.all([
    context.asset(inputs.source),
    inputs.firstFrame ? context.asset(inputs.firstFrame) : null,
    ...refs.map((ref) => context.asset(ref)),
  ]);
  if (!source!.mediaType.startsWith("video/"))
    throw new Error("Choose a video clip whose moves to copy");
  const media: CloudMediaInput[] = [
    {
      ...WAN_ANIMATE_MEDIA_INPUTS.source,
      url: await source!.fetchableUrl(),
      filename: mediaFilename("source", source!.mediaType),
      contentType: source!.mediaType,
    },
  ];
  if (keyframe)
    media.push({
      ...WAN_ANIMATE_MEDIA_INPUTS.keyframe,
      url: await keyframe.fetchableUrl(),
      filename: mediaFilename("keyframe", keyframe.mediaType),
      contentType: keyframe.mediaType,
    });
  for (const [i, reference] of references.entries())
    media.push({
      ...WAN_ANIMATE_MEDIA_INPUTS.reference(i),
      url: await reference!.fetchableUrl(),
      filename: mediaFilename(`reference_${i}`, reference!.mediaType),
      contentType: reference!.mediaType,
    });
  if (inputs.seconds === undefined)
    throw new Error("The clip's length is unknown; choose it again");
  const direction = extraDirection(
    inputs,
    context.mentions,
    [character.name, location?.name ?? ""].filter(Boolean),
  );
  return {
    model: WAN_ANIMATE_MODEL_ID,
    input: {
      graph: wanAnimateGraph({
        startSeconds: 0,
        // The composer trims the clip to the stretch it copies.
        seconds: Math.min(
          MOTION_ENGINES["wan-animate"].maxSeconds,
          inputs.seconds,
        ),
        fps: 24,
        size: WAN_ANIMATE_SIZE[inputs.resolution],
        keyframePrompt: keyframe
          ? null
          : moveKeyframePrompt({
              performer: inputs.performer,
              character,
              images: characterRefs.length,
              location,
              locationImages: placeRefs.length,
            }),
        references: references.length,
        prompt: wanAnimatePrompt(character, location, direction),
        motionPrompt: "",
        likeness: 1,
        seed: seedFrom(JSON.stringify([inputs.source, inputs.prompt])),
      }),
      media,
    },
  };
}
