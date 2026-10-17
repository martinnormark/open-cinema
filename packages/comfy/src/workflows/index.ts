import type { WorkflowKind } from "@open-cinema/contracts";
import {
  fluxImageWorkflow,
  fluxReferenceWorkflow,
  ltxVideoWorkflow,
} from "./definitions";
import type { WorkflowDefinition } from "./types";

export type {
  BuildContext,
  ProviderOutput,
  ProviderRequest,
  ResolvedAsset,
  WorkflowDefinition,
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
  ltxVideoWorkflow,
} from "./definitions";

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
};

export function getWorkflowDefinition<K extends WorkflowKind>(
  kind: K,
): WorkflowDefinition<K> | null {
  return (registry[kind] as WorkflowDefinition<K> | undefined) ?? null;
}

export function availableWorkflowKinds(): WorkflowKind[] {
  return Object.keys(registry) as WorkflowKind[];
}
