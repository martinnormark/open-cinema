import { VFX_EFFECTS, type VfxEffect } from "@open-cinema/contracts";
import { SAM3_CHECKPOINT } from "./ltx-edit";
import {
  LTX23_MODELS,
  ltxSamplerNodes,
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";

/**
 * Effects on a real take: LTX 2.3 with one of Lightricks' video-to-video
 * IC-LoRAs (water, day for night, clean plate). The take is the IC-LoRA's
 * reference at full output size, aligned from frame 0, so the framing, camera
 * and performance are the take's and the model adds only the effect.
 *
 * One pass at the generation size, no upscale stage: the model cards say the
 * reference only holds in the first stage, and a second stage drifts faces or
 * washes the effect out. The result is scaled back to the
 * take's size and keeps its frame rate and sound.
 *
 * Clearing the set can keep someone: SAM 3.1 tracks them in the take, and the
 * take's own pixels go back over the clean plate there.
 */
export const LTX_VFX_MODEL_ID = "comfy-cloud/ltx-2.3-vfx";

/**
 * The IC-LoRAs were trained on the dev model; Lightricks' own
 * LTX-2.3_V2V_ICLoRA_Single_Stage_Distilled workflow runs them on dev with
 * the distilled LoRA at half strength and the eight-step schedule.
 */
export const LTX_VFX_MODELS = {
  checkpoint: "ltx-2.3-22b-dev-fp8.safetensors",
  distilled: "ltx-2.3-22b-distilled-lora-384-1.1.safetensors",
} as const;

/**
 * Night needs guidance to get dark: at CFG 1 on the distilled schedule our
 * check take came back as the same sunny afternoon. Its card asks for 30
 * steps at guidance 3 to 4 on dev, which turned it to night in about a minute.
 */
const SCHEDULES: Partial<Record<VfxEffect, { steps: number; cfg: number }>> = {
  night: { steps: 30, cfg: 3.5 },
};

/**
 * About four seconds, like the other revisions. Water and the clean plate
 * were trained at about 960 px, night at 768.
 */
export const LTX_VFX_LIMITS: Record<VfxEffect, GraphLimits> = {
  water: { maxFrames: 97, maxSide: 960 },
  night: { maxFrames: 97, maxSide: 768 },
  "clean-plate": { maxFrames: 97, maxSide: 960 },
};

export const LTX_VFX_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
} as const;
export const LTX_VFX_OUTPUT_NODES = ["save_result"] as const;

export interface LtxVfxGraphOptions {
  effect: VfxEffect;
  /** The creator's words: the water, the night, or what to remove. */
  direction: string;
  /** Clear the set only: who or what stays, as a short noun phrase. */
  keep?: string | undefined;
  seed: number;
  /** Fewer frames for a cheap check run; never set by the app. */
  limits?: GraphLimits;
  /** Check runs only: another LoRA strength or a full guided schedule. */
  strength?: number;
  schedule?: { steps: number; cfg: number };
}

const clean = (text: string) => text.trim().replace(/[.\s]+$/, "");

/**
 * The prompts each model card asks for. Water uses its training captions'
 * reference/edited form and trigger; night and the clean plate describe the
 * result, not the change.
 */
export function ltxVfxPrompts(effect: VfxEffect, direction: string) {
  const words = clean(direction) || VFX_EFFECTS[effect].fallback;
  switch (effect) {
    case "water":
      return {
        prompt: `Reference shows the original shot. Edited shows the same scene with water added. ADD WATER ${words}. Subject identity, clothing, framing, and background geometry are identical to the reference; only water-related elements differ between reference and edited.`,
        negative:
          "worst quality, inconsistent motion, blurry, jittery, distorted, deformed water, warped faces",
      };
    case "night":
      return {
        prompt: `A realistic nighttime version of the same shot, lit by ${words}. Only the lighting changes from day to night; identical composition, framing, camera movement and motion.`,
        negative:
          "daytime, bright sunlight, blue sky, overexposed, worst quality, inconsistent motion, blurry, jittery, distorted",
      };
    case "clean-plate": {
      const remove = words.replace(/^(the|a|an) /i, "");
      return {
        prompt: `The same scene with no ${remove}: only the empty set, with everything that was behind them rebuilt. Identical framing, light and camera movement.`,
        negative: `${remove}, people, person, body parts, backpacks, shadows of people, ghosting, blur, jitter`,
      };
    }
  }
}

export function ltxVfxGraph(o: LtxVfxGraphOptions): Graph {
  const limits = o.limits ?? LTX_VFX_LIMITS[o.effect];
  const effect = VFX_EFFECTS[o.effect];
  const source = sourceClipNodes(limits);
  const prompts = ltxVfxPrompts(o.effect, o.direction);
  const schedule = o.schedule ?? SCHEDULES[o.effect];
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX_VFX_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    // The IC-LoRA last: its loader output is what the guide reads.
    loras: [
      ...(schedule ? [] : [{ name: LTX_VFX_MODELS.distilled, strength: 0.5 }]),
      { name: effect.lora, strength: o.strength ?? effect.strength },
    ],
    sampler: schedule ? "euler" : "euler_ancestral_cfg_pp",
    schedule,
    prompt: prompts.prompt,
    negative: prompts.negative,
    width: source.genWidth,
    height: source.genHeight,
    length: source.length,
    fps: source.fps,
    seed: o.seed,
    guide: { image: source.small, strength: 1 },
  });
  const graph: Graph = {
    ...source.nodes,
    ...ltx.nodes,
    // Back at the take's size, so the comparison lines up frame for frame.
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ltx.frames,
        upscale_method: "lanczos",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },
  };
  let result: Link = ["generated_full", 0];
  const keep = o.effect === "clean-plate" ? clean(o.keep ?? "") : "";
  if (keep) {
    Object.assign(graph, {
      sam3: {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: SAM3_CHECKPOINT },
      },
      keep_text: {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["sam3", 1], text: keep },
      },
      keep_track: {
        class_type: "SAM3_VideoTrack",
        inputs: {
          images: source.clip,
          model: ["sam3", 0],
          detection_threshold: 0.4,
          max_objects: 4,
          detect_interval: 1,
          conditioning: ["keep_text", 0],
        },
      },
      keep_masks: {
        class_type: "SAM3_TrackToMask",
        inputs: { track_data: ["keep_track", 0], object_indices: "" },
      },
      // A few pixels of room, so hair and edges come from the take.
      keep_mask: {
        class_type: "GrowMask",
        inputs: { mask: ["keep_masks", 0], expand: 8, tapered_corners: true },
      },
      composite: {
        class_type: "ImageCompositeMasked",
        inputs: {
          destination: ["generated_full", 0],
          source: source.clip,
          x: 0,
          y: 0,
          resize_source: false,
          mask: ["keep_mask", 0],
        },
      },
    } satisfies Graph);
    result = ["composite", 0];
  }
  Object.assign(
    graph,
    saveVideoNodes(
      "save_result",
      result,
      source.fps,
      source.audio,
      `vfx_${o.effect}`,
    ),
  );
  return graph;
}
