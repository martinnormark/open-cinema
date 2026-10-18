import { z } from "zod";

/**
 * Effects a real take can be given. Each is one of Lightricks' official
 * IC-LoRAs for LTX 2.3, reading the take itself as its reference, so the
 * framing, camera and performance come from the take and the model only adds
 * the effect. Names are the files in the Comfy Cloud model library.
 */
export const vfxEffectSchema = z.enum(["water", "night", "clean-plate"]);
export type VfxEffect = z.infer<typeof vfxEffectSchema>;

export const VFX_EFFECTS: Record<
  VfxEffect,
  {
    label: string;
    description: string;
    /** What the creator's words describe, as a field label. */
    ask: string;
    placeholder: string;
    /** Used when the creator writes nothing. */
    fallback: string;
    /** The limit a creator should know before running it. */
    note: string;
    lora: string;
    /**
     * Water's card gives 1.25 to 1.45 for a dramatic result; at 1.2 the rain
     * on our check take was a wet sheen with no drops in the air.
     */
    strength: number;
  }
> = {
  water: {
    label: "Add water",
    description:
      "Rain, a flood, surf or spray, acting on the people and the set.",
    ask: "The water",
    placeholder:
      "A heavy downpour, streaks of rain through the frame, splashing off the wall",
    fallback:
      "a heavy downpour, bright streaks of rain falling through the whole frame and splashing off every surface, water running down the people's clothes and dripping from their hair",
    note: "Water lands on the people too, so hair, faces and clothes can shift slightly.",
    lora: "ltx-2.3-22b-ic-lora-water-simulation-0.9.safetensors",
    strength: 1.4,
  },
  night: {
    label: "Day for night",
    description: "The same shot relit as night. Motion and framing stay.",
    ask: "The night",
    placeholder: "Moonlight, with warm street lamps along the wall",
    fallback: "cool moonlight with a few warm practical lights",
    note: "Every frame is relit, people included. Hard midday sun is the hardest case.",
    lora: "ltx-2.3-22b-ic-lora-day-to-night-0.9.safetensors",
    strength: 1,
  },
  "clean-plate": {
    label: "Clear the set",
    description:
      "Removes people and passing traffic and rebuilds what was behind them.",
    ask: "What to remove",
    placeholder: "The people walking in the background",
    fallback: "every person",
    note: "Works best on people who are small or near the edges, with set visible around them. Someone filling the frame cannot be cleared.",
    lora: "ltx-2.3-22b-ic-lora-clean-plate-1.0.safetensors",
    strength: 1,
  },
};
