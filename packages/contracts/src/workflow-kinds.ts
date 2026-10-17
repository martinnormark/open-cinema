import { z } from "zod";

/** The studio's supported generation workflows; each maps to one provider request builder. */
export const workflowKindSchema = z.enum([
  "image.flux",
  "image.flux-reference",
  "video.ltx",
  "video.background-replace",
  "video.character-replace",
  "video.performance-transfer",
  "video.object-swap",
  "video.restyle",
  "video.restage",
]);
export type WorkflowKind = z.infer<typeof workflowKindSchema>;
