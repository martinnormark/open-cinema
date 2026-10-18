import { z } from "zod";

/**
 * Edits that change part of a take and keep the rest: a stretch of time, a
 * brushed area, the frame's shape, or what happens after the last frame.
 * docs/take-edits.md records the runs behind each one.
 */

/** Make it longer: Seedance 2.5 extend on Router, or LTX 2.3 on Comfy Cloud. */
export const extendPipelineSchema = z.enum(["seedance", "ltx"]);
export type ExtendPipeline = z.infer<typeof extendPipelineSchema>;

export const EXTEND_PIPELINES: Record<
  ExtendPipeline,
  { label: string; description: string }
> = {
  seedance: {
    label: "Seedance 2.5",
    description:
      "The smoothest continuation, at 720p. It refuses takes with close, clear faces.",
  },
  ltx: {
    label: "LTX 2.3",
    description:
      "Open weights and quick, for any take. About three seconds, softer than the take.",
  },
};

/** Seconds Seedance adds; it accepts 4 to 30, and every second is billed. */
export const EXTEND_SECONDS = [4, 6, 8] as const;
export const extendSecondsSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
]);

/** Reframe: the shapes creators publish to. */
export const reframeAspectSchema = z.enum(["9:16", "4:5", "1:1", "16:9"]);
export type ReframeAspect = z.infer<typeof reframeAspectSchema>;

export const REFRAME_ASPECTS: Record<
  ReframeAspect,
  { label: string; ratio: number }
> = {
  "9:16": { label: "Vertical", ratio: 9 / 16 },
  "4:5": { label: "Portrait", ratio: 4 / 5 },
  "1:1": { label: "Square", ratio: 1 },
  "16:9": { label: "Widescreen", ratio: 16 / 9 },
};

/** Redo a moment: the stretch regenerated, kept short so both ends join. */
export const MOMENT_LIMITS = { minSeconds: 0.3, maxSeconds: 3 } as const;
export const momentRangeSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .refine((r) => r.end - r.start >= MOMENT_LIMITS.minSeconds, {
    message: "Choose a moment of at least a third of a second",
  })
  .refine((r) => r.end - r.start <= MOMENT_LIMITS.maxSeconds + 0.01, {
    message: `Choose a moment of at most ${MOMENT_LIMITS.maxSeconds} seconds`,
  });
export type MomentRange = z.infer<typeof momentRangeSchema>;
