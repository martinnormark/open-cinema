import type { WorkflowKind } from "@open-cinema/contracts";
import {
  backgroundReplaceWorkflow,
  characterReplaceWorkflow,
  fluxImageWorkflow,
  fluxReferenceWorkflow,
  ltxVideoWorkflow,
} from "./definitions";
import type { WorkflowDefinition, WorkflowStage } from "./types";

export type {
  BuildContext,
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
} from "./definitions";
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
};

export function getWorkflowDefinition<K extends WorkflowKind>(
  kind: K,
): WorkflowDefinition<K> | null {
  return (registry[kind] as WorkflowDefinition<K> | undefined) ?? null;
}

/** Stage 0 is the definition's own request; stage n is `stages[n - 1]`. */
export function workflowStage(
  kind: WorkflowKind,
  stage: number,
): WorkflowStage | null {
  if (stage <= 0) return null;
  return (registry[kind]?.stages?.[stage - 1] as WorkflowStage) ?? null;
}

export function availableWorkflowKinds(): WorkflowKind[] {
  return Object.keys(registry) as WorkflowKind[];
}
