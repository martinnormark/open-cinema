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
 * New angles for re-staging a take. Each is a small camera move from where the
 * take was shot: the take is re-projected through its own depth to the new
 * position, so only small moves hold up: about a hand's width sideways
 * or a step in or out. They are sized for people 1.5 to 3 m from the camera. There is no
 * reverse angle.
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
    /**
     * Where the camera moves, in metres from the original position: x to the
     * right, y up, z toward the original camera (negative moves in). It keeps
     * aiming at a point 2 m ahead, where a subject usually stands.
     */
    move: { x: number; y: number; z: number };
  }
> = {
  closer: {
    label: "Move in",
    description: "Same angle, a step closer.",
    move: { x: 0, y: 0, z: -0.3 },
  },
  wider: {
    label: "Pull out",
    description: "Same angle, a step back. The new edges are filled in.",
    move: { x: 0, y: 0, z: 0.3 },
  },
  "low-angle": {
    label: "Low angle",
    description: "The camera drops and looks up a little.",
    move: { x: 0, y: -0.15, z: 0 },
  },
  "high-angle": {
    label: "High angle",
    description: "The camera rises and looks down a little.",
    move: { x: 0, y: 0.15, z: 0 },
  },
  "from-left": {
    label: "Swing left",
    description: "The camera moves a little to the left.",
    move: { x: -0.15, y: 0, z: 0 },
  },
  "from-right": {
    label: "Swing right",
    description: "The camera moves a little to the right.",
    move: { x: 0.15, y: 0, z: 0 },
  },
  hero: {
    label: "Hero",
    description: "Lower and a step closer.",
    move: { x: 0.08, y: -0.12, z: -0.2 },
  },
};
