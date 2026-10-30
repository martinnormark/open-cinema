import { z } from "zod";
import type { ElementType } from "./elements";

/**
 * Named building blocks: the models, adapters and techniques a recipe relies
 * on, described by what they contribute rather than how they are wired. Only
 * `ready` capabilities run in the studio today; the rest are listed so a
 * creator can see what is coming and why, not offered as controls.
 */
export const capabilityIdSchema = z.enum([
  "flux-image",
  "flux-references",
  "character-sheets",
  // Shown as "Look"; the id stays because saved recipes store it.
  "project-look",
  "ltx-video",
  "flux-video",
  "ltx-alpha-gen",
  "ltx-camera",
  "ltx-pose-control",
  "ltx-union-control",
  "ltx-detailer",
  "kling-omni-edit",
]);
export type CapabilityId = z.infer<typeof capabilityIdSchema>;

export type CapabilityKind = "model" | "adapter" | "technique";

export interface Capability {
  id: CapabilityId;
  name: string;
  kind: CapabilityKind;
  /** One line: what it is for. */
  purpose: string;
  /** What it changes in a result, and how strongly. */
  influence: string;
  media: readonly ("image" | "video")[];
  /** Element types it makes use of; empty means it does not read Elements. */
  uses: readonly ElementType[];
  /** True when it reads approved reference images rather than only names. */
  readsReferences: boolean;
  limitations: readonly string[];
  /** `ready` runs in the studio; `planned` is known to work upstream but is not wired. */
  status: "ready" | "planned";
  /** Where it runs. */
  runsOn: string;
}

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  "flux-image": {
    id: "flux-image",
    name: "FLUX 3 Image",
    kind: "model",
    purpose: "Stills from a written idea.",
    influence:
      "Follows composition, light and lens language closely; rewrites short prompts with its own detail.",
    media: ["image"],
    uses: [],
    readsReferences: false,
    limitations: [
      "Takes no seed, so the same prompt gives a new take each time.",
    ],
    status: "ready",
    runsOn: "Comfy Router",
  },
  "flux-references": {
    id: "flux-references",
    name: "Element references",
    kind: "technique",
    purpose:
      "Carries your approved reference images into FLUX 3 so Elements stay recognizable.",
    influence:
      "Strong on face, build, wardrobe and materials; up to ten references per image.",
    media: ["image"],
    uses: ["character", "location", "thing"],
    readsReferences: true,
    limitations: [
      "An Element with no approved references is carried by name only.",
      "Faces drift when the character is small in a wide frame.",
    ],
    status: "ready",
    runsOn: "Comfy Router",
  },
  "character-sheets": {
    id: "character-sheets",
    name: "Character sheets",
    kind: "technique",
    purpose:
      "Three-panel sheets per state: headless front and back bodies plus a large close portrait.",
    influence:
      "Keeps wardrobe and build separate from the face, so a state can change clothes without changing who it is.",
    media: ["image"],
    uses: ["character"],
    readsReferences: true,
    limitations: [
      "Needs an approved close portrait before the sheet can be made.",
    ],
    status: "ready",
    runsOn: "Comfy Router",
  },
  "project-look": {
    id: "project-look",
    name: "Look",
    kind: "technique",
    purpose:
      "Palette, lighting, lens, texture and pacing chosen for a shot or carried by a recipe.",
    influence: "Written into each prompt as camera language.",
    media: ["image", "video"],
    uses: [],
    readsReferences: false,
    limitations: [
      "Selective revisions follow only palette, lighting and texture; framing and lens belong to the source take.",
    ],
    status: "ready",
    runsOn: "In the studio",
  },
  "ltx-video": {
    id: "ltx-video",
    name: "LTX 2.5",
    kind: "model",
    purpose: "Short clips with sound from a written idea.",
    influence:
      "Strong on motion, pacing and camera language; 2 to 10 seconds at 720p or 1080p.",
    media: ["video"],
    uses: ["character", "location", "thing"],
    readsReferences: false,
    limitations: [
      "Router's LTX is text-to-video: Elements carry by name and description, not by their reference images.",
    ],
    status: "ready",
    runsOn: "Comfy Router",
  },
  "flux-video": {
    id: "flux-video",
    name: "Animate a still",
    kind: "model",
    purpose: "Starts a clip from an image you made or kept.",
    influence:
      "Holds the still's composition, faces and look for the first frames, then moves it.",
    media: ["video"],
    uses: [],
    readsReferences: false,
    limitations: ["Runs on FLUX 3 Video, 5 to 20 seconds."],
    status: "ready",
    runsOn: "Comfy Router",
  },
  "ltx-alpha-gen": {
    id: "ltx-alpha-gen",
    name: "LTX Alpha Gen",
    kind: "adapter",
    purpose:
      "An LTX 2.5 IC-LoRA that mattes the people in a take so the background can change around them.",
    influence:
      "Keeps every pixel of the performers; only what is behind them is replaced.",
    media: ["video"],
    uses: ["location"],
    readsReferences: true,
    limitations: [
      "Up to 121 frames per take.",
      "Needs a Comfy API key for Comfy Cloud.",
    ],
    status: "ready",
    runsOn: "Comfy Cloud, LTX 2.5 open weights",
  },
  "ltx-camera": {
    id: "ltx-camera",
    name: "LTX camera moves",
    kind: "adapter",
    purpose:
      "LTX-2 camera-control LoRAs: dolly, truck and crane moves made by the model, not by prompt wording.",
    influence:
      "The camera does the named move; describe the scene and leave the camera to the LoRA.",
    media: ["video"],
    uses: [],
    readsReferences: false,
    limitations: ["Four-second takes on a Cloud GPU billed by time."],
    status: "ready",
    runsOn: "Comfy Cloud, LTX-2 open weights",
  },
  "ltx-pose-control": {
    id: "ltx-pose-control",
    name: "LTX Pose Control",
    kind: "adapter",
    purpose:
      "An LTX-2 IC-LoRA that moves a new subject with the body motion of a reference take.",
    influence:
      "Transfers pose and timing; strength from loose (more freedom) to strict.",
    media: ["video"],
    uses: ["character"],
    readsReferences: false,
    limitations: [
      "Only for the older LTX 2.0 19B model on Cloud; Union Control covers pose on 2.3.",
    ],
    status: "planned",
    runsOn: "Comfy Cloud, LTX 2.0 open weights",
  },
  "ltx-union-control": {
    id: "ltx-union-control",
    name: "LTX Union Control",
    kind: "adapter",
    purpose:
      "An LTX 2.3 IC-LoRA that follows a take's pose or depth, so a different Character can perform it.",
    influence:
      "Keeps the acting, blocking and timing of the source; appearance comes from the keyframe and prompt.",
    media: ["video"],
    uses: ["character", "location"],
    readsReferences: true,
    limitations: [
      "At most 97 frames, about 4 s; no composer in the studio yet.",
    ],
    status: "planned",
    runsOn: "Comfy Cloud, LTX 2.3 open weights",
  },
  "ltx-detailer": {
    id: "ltx-detailer",
    name: "LTX Detailer",
    kind: "adapter",
    purpose: "An LTX-2 IC-LoRA that adds fine detail to a finished clip.",
    influence: "Sharper texture and faces without changing the shot.",
    media: ["video"],
    uses: [],
    readsReferences: false,
    limitations: ["Not yet wired."],
    status: "planned",
    runsOn: "Comfy Cloud, LTX-2 open weights",
  },
  "kling-omni-edit": {
    id: "kling-omni-edit",
    name: "Kling 3.0 Omni edit",
    kind: "model",
    purpose:
      "Regenerates a setting or one person in a take from your Location or Character.",
    influence:
      "Relights the scene; the studio locks the original performers back in for background swaps.",
    media: ["video"],
    uses: ["character", "location"],
    readsReferences: true,
    limitations: [
      "Recast needs a visible face of medium size; back views are refused.",
    ],
    status: "ready",
    runsOn: "Comfy Router",
  },
};
