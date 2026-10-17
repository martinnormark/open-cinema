import type {
  AssetRef,
  ResolvedMention,
  WorkflowInputs,
  WorkflowKind,
} from "@open-cinema/contracts";

/** Media an input refers to, made reachable for a provider at submission time. */
export interface ResolvedAsset {
  ref: AssetRef;
  mediaType: string;
  sizeBytes: number | null;
  /** Raw base64 of the stored bytes. Rejects above the inline size limit. */
  base64(): Promise<string>;
  /** The same bytes as a `data:` URI, for models that ask for one. */
  dataUri(): Promise<string>;
  /**
   * Short-lived https URL a provider can fetch, or null when this deployment
   * has no public media origin (local development). Never persist it.
   */
  publicUrl: string | null;
}

export interface BuildContext {
  /** Mentions resolved when the job was accepted, in prompt order. */
  mentions: readonly ResolvedMention[];
  /** Resolves any ref the request or a mention carries; throws if unavailable. */
  asset(ref: AssetRef): Promise<ResolvedAsset>;
}

/** The Router call: `POST /v2/models/{model}` with this input document. */
export interface ProviderRequest {
  model: string;
  input: Record<string, unknown>;
}

/** One downloadable result. `providerAssetId` must be stable across reads. */
export interface ProviderOutput {
  providerAssetId: string;
  url: string;
  mediaType: string;
}

/**
 * Everything the coordinator needs to run one workflow kind. A definition is
 * pure: it builds requests and reads results but never performs I/O itself,
 * except through the BuildContext it is handed. Estimates live in ../estimates.ts.
 */
export interface WorkflowDefinition<K extends WorkflowKind = WorkflowKind> {
  kind: K;
  /** Creator-facing model name shown on the job. */
  displayModel: string;
  /** Monitoring deadline from acceptance to a terminal provider state. */
  deadlineMs: number;
  /** Router model id for these inputs. Must be deterministic. */
  model(inputs: WorkflowInputs<K>): string;
  build(
    inputs: WorkflowInputs<K>,
    context: BuildContext,
  ): Promise<ProviderRequest>;
  /** Maps the Router result document (`data`) to outputs; [] means unusable. */
  outputs(result: unknown): ProviderOutput[];
}
