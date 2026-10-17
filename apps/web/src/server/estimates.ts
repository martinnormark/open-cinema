import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generationEstimateSchema,
  generationRequestSchema,
  WORKFLOW_DESCRIPTORS,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { requireSession } from "./session";

const estimateInputSchema = z.object({
  request: generationRequestSchema,
  /** Resolved reference count, including Element sheets from mentions. */
  references: z.number().int().min(0).max(10).optional(),
});

/** Cost and time shown before a generation starts. Pure; no provider call. */
export const getGenerationEstimate = createServerFn({ method: "POST" })
  .validator(estimateInputSchema)
  .handler(async ({ data }) => {
    await requireSession();
    const { request, ...options } = data;
    return {
      models: WORKFLOW_DESCRIPTORS[request.workflowKind].models,
      estimate: generationEstimateSchema.parse(
        estimateGeneration(request, options),
      ),
    };
  });
