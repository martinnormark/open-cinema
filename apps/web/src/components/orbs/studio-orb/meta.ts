import type { OrbVariant } from "@/components/orbs/canvas";
import {
  studioOrbParams,
  studioOrbShader,
} from "@/components/orbs/studio-orb/gpu";

export const meta = {
  description: "soft pools of warm light drifting over a dark lit sphere",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "studio-orb",
  title: "Studio Orb",
} as const;

export const studioOrb: OrbVariant = {
  // Shader uniforms, mirrored by .orb-fallback in styles.css.
  colors: [
    { default: "#fff2dd", key: "light", label: "Light" }, // design-token-exempt: shader uniform
    { default: "#161616", key: "base", label: "Base" }, // design-token-exempt: shader uniform
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    // Integrated phases: the renderer turns these rates into clocks.
    {
      default: 0.4,
      integrate: true,
      key: "flow",
      label: "Flow",
      max: 6,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.12,
      integrate: true,
      key: "spin",
      label: "Roll",
      max: 3,
      min: 0,
      step: 0.01,
    },
    { default: 0.9, key: "warp", label: "Warp", max: 3, min: 0, step: 0.05 },
    { default: 2.2, key: "scale", label: "Scale", max: 6, min: 0.5, step: 0.1 },
    {
      default: 0.36,
      key: "coverage",
      label: "Coverage",
      max: 0.9,
      min: 0.05,
      step: 0.01,
    },
    {
      default: 0.12,
      key: "softness",
      label: "Softness",
      max: 0.4,
      min: 0.01,
      step: 0.01,
    },
    { default: 0.25, key: "rim", label: "Rim", max: 1.5, min: 0, step: 0.01 },
    { default: 1, key: "gain", label: "Gain", max: 2.5, min: 0.1, step: 0.05 },
    { default: 0, key: "breath", label: "Breath", max: 1, min: 0, step: 0.01 },
    {
      default: 0.86,
      key: "radius",
      label: "Radius",
      max: 1,
      min: 0.3,
      step: 0.01,
    },
  ],
  shader: studioOrbShader,
  /*
    Same palette in every state. Thinking reads as busier rather than louder:
    faster flow and roll, a stronger warp, a brighter rim and a slow breath.
    The renderer springs between presets, so state changes never jump.
  */
  statePresets: {
    idle: {
      breath: 0,
      coverage: 0.36,
      flow: 0.4,
      gain: 1,
      rim: 0.25,
      spin: 0.12,
      warp: 0.9,
    },
    speaking: {
      breath: 0.5,
      coverage: 0.4,
      flow: 0.9,
      gain: 1.1,
      rim: 0.4,
      spin: 0.3,
      warp: 1.2,
    },
    thinking: {
      breath: 1,
      coverage: 0.33,
      flow: 2.4,
      gain: 1.2,
      rim: 0.45,
      spin: 0.45,
      warp: 1.7,
    },
  },
  uniforms: studioOrbParams,
};
