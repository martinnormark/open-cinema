import type { WorkflowKind } from "@open-cinema/contracts";
import {
  backgroundReplaceWorkflow,
  characterReplaceWorkflow,
  fluxImageWorkflow,
  fluxReferenceWorkflow,
  ltxVideoWorkflow,
  performanceTransferWorkflow,
} from "./definitions";
import { objectSwapWorkflow, restyleWorkflow } from "./revision-modes";
import type { WorkflowDefinition, WorkflowStage } from "./types";

export type {
  BuildContext,
  CloudMediaInput,
  CloudWorkflowRequest,
  MediaOperation,
  MediaStage,
  MediaTask,
  ProviderOutput,
  ProviderRequest,
  ResolvedAsset,
  RouterStage,
  StageContext,
  WorkflowDefinition,
  WorkflowStage,
} from "./types";
export {
  MEDIA_GRAPH_INPUTS,
  MEDIA_GRAPH_OUTPUT,
  MEDIA_GRAPH_PARTS,
  mediaGraph,
} from "./media-graphs";
export type { MediaGraphOptions, MediaPartName } from "./media-graphs";
export {
  expandMentions,
  httpsUrl,
  mediaTypeFromUrl,
  resultField,
} from "./results";
export {
  fluxImageWorkflow,
  fluxReferenceWorkflow,
  fluxSampleOutputs,
  ltxVideoOutputs,
  routerSampleOutputs,
  ltxVideoWorkflow,
  backgroundReplaceWorkflow,
  characterReplaceWorkflow,
  performanceTransferWorkflow,
} from "./definitions";
export {
  LTX_PERFORMANCE_LIMITS,
  LTX_PERFORMANCE_MODEL_ID,
  LTX_PERFORMANCE_MODELS,
  characterKeyframe,
  ltxPerformanceGraph,
  performancePrompt,
} from "./ltx-performance-transfer";
export {
  CHARACTER_REPLACE_MODEL,
  characterReferences,
  characterReplacePrompt,
  characterReplaceRequest,
  describeTarget,
} from "./character-replace";
export {
  BACKGROUND_MATTE_MODEL,
  BACKGROUND_REPLACE_MODELS,
  DEFAULT_BACKGROUND_PIPELINE,
  MATTE_STAGE,
  backgroundLockStage,
  backgroundMatteOutputs,
  backgroundMatteRequest,
  backgroundMatteStage,
  backgroundEditPrompt,
  backgroundReplaceOutputs,
  klingBackgroundRequest,
  switchxBackgroundRequest,
} from "./background-replace";

export {
  describeObject,
  objectSwapWorkflow,
  restyleWorkflow,
  thingReferences,
} from "./revision-modes";
export { ltxEditGraph, ltxEditPrompts, LTX_EDIT_LIMITS } from "./ltx-edit";
export { ltxCameraGraph } from "./ltx-camera";

type Registry = { [K in WorkflowKind]?: WorkflowDefinition<K> };

/**
 * One entry per workflow kind. Add a kind by writing its request builder in its
 * own file here, wrapping it in a WorkflowDefinition, and registering it below;
 * the coordinator needs no change. Unregistered kinds are rejected at submission.
 */
const registry: Registry = {
  "image.flux": fluxImageWorkflow,
  "image.flux-reference": fluxReferenceWorkflow,
  "video.ltx": ltxVideoWorkflow,
  "video.background-replace": backgroundReplaceWorkflow,
  "video.character-replace": characterReplaceWorkflow,
  "video.performance-transfer": performanceTransferWorkflow,
  "video.object-swap": objectSwapWorkflow,
  "video.restyle": restyleWorkflow,
  // "video.restage" is off: its only model was a community IC-LoRA, and the
  // app uses no LoRA made by someone else (docs/third-party-ip.md).
};

export function getWorkflowDefinition<K extends WorkflowKind>(
  kind: K,
): WorkflowDefinition<K> | null {
  return (registry[kind] as WorkflowDefinition<K> | undefined) ?? null;
}

/** Stage 0 is the definition's own request; stage n is `stages[n - 1]`. */
/** The stages that follow the first request for these inputs. */
export function workflowStages(
  kind: WorkflowKind,
  inputs: unknown,
): readonly WorkflowStage[] {
  const stages = (registry[kind] as WorkflowDefinition | undefined)?.stages;
  return (
    (typeof stages === "function" ? stages(inputs as never) : stages) ?? []
  );
}

export function workflowStage(
  kind: WorkflowKind,
  stage: number,
  inputs: unknown,
): WorkflowStage | null {
  if (stage <= 0) return null;
  return workflowStages(kind, inputs)[stage - 1] ?? null;
}

export function availableWorkflowKinds(): WorkflowKind[] {
  return Object.keys(registry) as WorkflowKind[];
}
