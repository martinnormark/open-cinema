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
  /**
   * An https URL a provider can fetch: `publicUrl` when set, otherwise the
   * bytes uploaded to Comfy's API-node storage (signed for about 24 h). Use it
   * for models that accept media by URL only. Never persist it.
   */
  fetchableUrl(): Promise<string>;
}

export interface BuildContext {
  /** Mentions resolved when the job was accepted, in prompt order. */
  mentions: readonly ResolvedMention[];
  /** Resolves any ref the request or a mention carries; throws if unavailable. */
  asset(ref: AssetRef): Promise<ResolvedAsset>;
}

/** What a later stage sees: the request's media plus the outputs saved so far. */
export interface StageContext extends BuildContext {
  /** A saved output of this job by its stored provider asset id, e.g. "matte:video". */
  output(providerAssetId: string): AssetRef | null;
  /** Provider asset ids of every saved output, in the order they were saved. */
  saved: readonly string[];
}

/** Steps a media container performs; see apps/jobs/media/server.mjs. */
export type MediaOperation = "lock" | "conform" | "square";
/** One container call that produces one output from named media parts. */
export interface MediaTask {
  /** Stored as `{stage id}:{output}`. */
  output: string;
  operation: MediaOperation;
  parts: readonly { name: string; ref: AssetRef }[];
}

interface StageBase {
  /** Prefix of this stage's stored outputs; unique within the workflow. */
  id: string;
  /** Creator-facing, e.g. "Locking the performers". */
  label: string;
  /** Monitoring deadline for this stage, from when it starts. */
  deadlineMs: number;
}
/** A further Router request built from the saved outputs. */
export interface RouterStage<
  K extends WorkflowKind = WorkflowKind,
> extends StageBase {
  kind: "router";
  model: string;
  build(
    inputs: WorkflowInputs<K>,
    context: StageContext,
  ): Promise<ProviderRequest>;
  outputs(result: unknown): ProviderOutput[];
}
/** Container work over saved media; each task saves one output. */
export interface MediaStage<
  K extends WorkflowKind = WorkflowKind,
> extends StageBase {
  kind: "media";
  tasks(inputs: WorkflowInputs<K>, context: StageContext): MediaTask[];
}
export type WorkflowStage<K extends WorkflowKind = WorkflowKind> =
  RouterStage<K> | MediaStage<K>;

/** The Router call: `POST /v2/models/{model}` with this input document. */
export interface ProviderRequest {
  model: string;
  input: Record<string, unknown>;
}

/** A media file a Comfy Cloud graph loads: fetched by the Worker and uploaded as a job asset. */
export interface CloudMediaInput {
  /** API-graph node id and the loader's file field. */
  node: string;
  field: string;
  /** Short-lived https URL of the bytes. Never persist it. */
  url: string;
  /** Name the uploaded asset gets; the extension tells the loader its format. */
  filename: string;
  contentType: string;
}

/** The Comfy Cloud call: an API-format graph plus the media its loaders read. */
export interface CloudWorkflowRequest {
  model: string;
  input: {
    graph: Record<string, unknown>;
    media: CloudMediaInput[];
  };
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
  displayModel: string | ((inputs: WorkflowInputs<K>) => string);
  /** Monitoring deadline from acceptance to a terminal provider state. */
  deadlineMs: number;
  /** Router model id (or Cloud pipeline id) for these inputs. Must be deterministic. */
  model(inputs: WorkflowInputs<K>): string;
  /**
   * Where these inputs run. Router by default; `cloud-workflow` runs the
   * request's graph on Comfy Cloud, for open-weights pipelines Router lacks.
   * Must be deterministic.
   */
  provider?(inputs: WorkflowInputs<K>): "router" | "cloud-workflow";
  /** Cloud only: SaveVideo/SaveImage node ids in the order outputs are listed. */
  cloudOutputNodes?: readonly string[];
  build(
    inputs: WorkflowInputs<K>,
    context: BuildContext,
  ): Promise<ProviderRequest | CloudWorkflowRequest>;
  /** Maps the Router result document (`data`) to outputs; [] means unusable. */
  outputs(result: unknown): ProviderOutput[];
  /**
   * Steps that run in order once the first request's outputs are saved. The
   * job succeeds after the last one; each stage's outputs are kept. A
   * function picks them from the inputs and must be deterministic.
   */
  stages?:
    | readonly WorkflowStage<K>[]
    | ((inputs: WorkflowInputs<K>) => readonly WorkflowStage<K>[]);
  /** Creator-facing label of the first request while later stages follow. */
  label?: string;
}
