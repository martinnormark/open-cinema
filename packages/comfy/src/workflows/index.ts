import type { WorkflowKind } from "@open-cinema/contracts";
import {
  backgroundReplaceWorkflow,
  characterReplaceWorkflow,
  fluxImageWorkflow,
  fluxReferenceWorkflow,
  ltxVideoWorkflow,
  performanceTransferWorkflow,
  referenceVideoWorkflow,
} from "./definitions";
import {
  objectSwapWorkflow,
  restageWorkflow,
  restyleWorkflow,
  vfxWorkflow,
} from "./revision-modes";
import {
  areaWorkflow,
  extendWorkflow,
  momentWorkflow,
  reframeWorkflow,
} from "./take-edits";
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
  DUB_STAGE,
  WAN3_MODEL,
  wan3Duration,
  wan3MovesOutputs,
  wan3MovesPrompt,
  wan3TrackedCastPrompt,
} from "./moves";
export {
  SAM3_MODEL,
  TRACK_COLOURS,
  trackWindow,
  WAN3_CAST_JOB_MODEL,
  WAN3_CAST_LIMITS,
  WAN3_CAST_MODEL_ID,
  WAN3_CAST_OUTPUT_NODES,
  wan3CastGraph,
} from "./wan3-cast";
export {
  WAN_ANIMATE_MODEL_ID,
  WAN_ANIMATE_OUTPUT_NODES,
  wanFrameCount,
  wanWindows,
} from "./wan-animate";
export {
  CHARACTER_REPLACE_MODEL,
  characterReferences,
  characterReplacePrompt,
  characterReplaceRequest,
  describeTarget,
} from "./character-replace";
export {
  planReferences,
  REFERENCE_RULE,
  REFERENCE_VIDEO_MODEL,
  referenceVideoPrompt,
  referenceVideoRequest,
} from "./reference-video";
export {
  BACKGROUND_MATTE_MODEL,
  BACKGROUND_REPLACE_MODEL,
  MATTE_STAGE,
  backgroundLockStage,
  backgroundMatteOutputs,
  backgroundMatteRequest,
  backgroundMatteStage,
  backgroundEditPrompt,
  backgroundReplaceOutputs,
  klingBackgroundRequest,
} from "./background-replace";

export {
  describeObject,
  objectSwapWorkflow,
  restageWorkflow,
  restyleWorkflow,
  thingReferences,
  vfxWorkflow,
} from "./revision-modes";
export { ltxEditGraph, ltxEditPrompts, LTX_EDIT_LIMITS } from "./ltx-edit";
export {
  ltxRecastGraph,
  ltxRecastPrompts,
  LTX_RECAST_LIMITS,
  LTX_RECAST_MODELS,
} from "./ltx-recast";
export { ltxCameraGraph } from "./ltx-camera";
export { ltxRestageGraph, LTX_RESTAGE_LIMITS } from "./ltx-restage";
export { ltxVfxGraph, ltxVfxPrompts, LTX_VFX_LIMITS } from "./ltx-vfx";
export { ltxFillGraph, LTX_FILL_LIMITS, LTX_FILL_MODELS } from "./ltx-fill";
export { wanAreaGraph, WAN_VACE_LIMITS, WAN_VACE_MODELS } from "./wan-vace";
export {
  areaAdds,
  areaWorkflow,
  extendWorkflow,
  leadReferences,
  momentWorkflow,
  reframeWorkflow,
  seedanceExtendPrompt,
  SEEDANCE_EXTEND_MODEL,
} from "./take-edits";

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
  "video.reference": referenceVideoWorkflow,
  "video.background-replace": backgroundReplaceWorkflow,
  "video.character-replace": characterReplaceWorkflow,
  "video.performance-transfer": performanceTransferWorkflow,
  "video.object-swap": objectSwapWorkflow,
  "video.restyle": restyleWorkflow,
  "video.restage": restageWorkflow,
  "video.vfx": vfxWorkflow,
  "video.extend": extendWorkflow,
  "video.area": areaWorkflow,
  "video.moment": momentWorkflow,
  "video.reframe": reframeWorkflow,
};

export function getWorkflowDefinition<K extends WorkflowKind>(
  kind: K,
): WorkflowDefinition<K> | null {
  return (registry[kind] as WorkflowDefinition<K> | undefined) ?? null;
}

/**
 * The stages that follow the first request for these inputs. Stage 0 is the
 * definition's own request; stage n is `stages[n - 1]`.
 */
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
export {
  graphModels,
  workflowExports,
  workflowFileContents,
  workflowManifest,
} from "./exports";
export type { WorkflowExport } from "./exports";
