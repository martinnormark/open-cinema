import { z } from "zod";

/**
 * Camera moves a generated video can be given. Each one is a Lightricks
 * camera-control LoRA on LTX-2, so the move is made by the model's weights,
 * not by wording; the phrase is added to the prompt only to agree with it.
 */
export const cameraMoveSchema = z.enum([
  "static",
  "dolly-in",
  "dolly-out",
  "truck-left",
  "truck-right",
  "crane-up",
  "crane-down",
]);
export type CameraMove = z.infer<typeof cameraMoveSchema>;

export const CAMERA_MOVES: Record<
  CameraMove,
  { label: string; description: string; prompt: string; lora: string }
> = {
  static: {
    label: "Locked off",
    description: "The camera holds still on a tripod.",
    prompt: "Static locked-off camera.",
    lora: "ltx-2-19b-lora-camera-control-static.safetensors",
  },
  "dolly-in": {
    label: "Push in",
    description: "The camera travels toward the subject.",
    prompt: "The camera dollies in.",
    lora: "ltx-2-19b-lora-camera-control-dolly-in.safetensors",
  },
  "dolly-out": {
    label: "Pull back",
    description: "The camera travels away, revealing more.",
    prompt: "The camera dollies out.",
    lora: "ltx-2-19b-lora-camera-control-dolly-out.safetensors",
  },
  "truck-left": {
    label: "Track left",
    description: "The camera slides sideways to the left.",
    prompt: "The camera trucks left.",
    lora: "ltx-2-19b-lora-camera-control-dolly-left.safetensors",
  },
  "truck-right": {
    label: "Track right",
    description: "The camera slides sideways to the right.",
    prompt: "The camera trucks right.",
    lora: "ltx-2-19b-lora-camera-control-dolly-right.safetensors",
  },
  "crane-up": {
    label: "Crane up",
    description: "The camera rises on a jib.",
    prompt: "The camera rises on a jib.",
    lora: "ltx-2-19b-lora-camera-control-jib-up.safetensors",
  },
  "crane-down": {
    label: "Crane down",
    description: "The camera descends on a jib.",
    prompt: "The camera descends on a jib.",
    lora: "ltx-2-19b-lora-camera-control-jib-down.safetensors",
  },
};

/**
 * New angles for re-staging a take, in the vocabulary the CrossView-Prompt
 * IC-LoRA was trained on. Its cameras covered a frontal sector of about ±60°,
 * so there is no reverse angle, and single steps hold up best.
 */
export const restageAngleSchema = z.enum([
  "closer",
  "wider",
  "low-angle",
  "high-angle",
  "from-left",
  "from-right",
  "hero",
]);
export type RestageAngle = z.infer<typeof restageAngleSchema>;

export const RESTAGE_ANGLES: Record<
  RestageAngle,
  {
    label: string;
    description: string;
    azimuth: string;
    elevation: string;
    distance: string;
  }
> = {
  closer: {
    label: "Move in",
    description: "Same angle, a tighter frame.",
    azimuth: "same angle",
    elevation: "same height",
    distance: "closer",
  },
  wider: {
    label: "Pull out",
    description: "Same angle, a wider frame.",
    azimuth: "same angle",
    elevation: "same height",
    distance: "further",
  },
  "low-angle": {
    label: "Low angle",
    description: "The camera drops and looks up.",
    azimuth: "same angle",
    elevation: "lower",
    distance: "same distance",
  },
  "high-angle": {
    label: "High angle",
    description: "The camera rises and looks down.",
    azimuth: "same angle",
    elevation: "higher",
    distance: "same distance",
  },
  "from-left": {
    label: "Swing left",
    description: "The camera moves around to the left.",
    azimuth: "to the left",
    elevation: "same height",
    distance: "same distance",
  },
  "from-right": {
    label: "Swing right",
    description: "The camera moves around to the right.",
    azimuth: "to the right",
    elevation: "same height",
    distance: "same distance",
  },
  hero: {
    label: "Hero",
    description: "Lower and closer, slightly to the side.",
    azimuth: "slightly to the right",
    elevation: "lower",
    distance: "closer",
  },
};
