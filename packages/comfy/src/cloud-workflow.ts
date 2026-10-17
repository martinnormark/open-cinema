import { Comfy, ComfyError, type Job as ProviderJob } from "@comfyorg/sdk";
import type { JobState } from "@open-cinema/contracts";
import type { CloudMediaInput, CloudWorkflowRequest } from "./workflows/types";

const COMFY_CLOUD_BASE_URL = "https://cloud.comfy.org";
export { fluxKleinWorkflow } from "./flux-klein";

export interface ComfyJobStatus {
  providerJobId: string;
  state: JobState;
  progress: number | null;
  outputs: { providerAssetId: string; mediaType: string }[];
  error: string | null;
}
export function mapProviderState(status: string): JobState {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "canceling":
      return "cancelling";
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "cancelled";
    case "failed":
    case "expired":
      return "failed";
    default:
      return "needs_attention";
  }
}
/**
 * With `order`, only those nodes' files, in that order: loaders can report
 * their inputs as outputs, and a revision takes the first file as its result.
 */
function savedOutputs(job: ProviderJob, order: readonly string[]) {
  if (!order.length) return job.outputs;
  return job.outputs
    .filter((o) => order.includes(o.nodeId))
    .sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId));
}
function status(
  job: ProviderJob,
  order: readonly string[] = [],
): ComfyJobStatus {
  const value = job.progress?.value;
  return {
    providerJobId: job.id,
    state: mapProviderState(job.status),
    progress:
      value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : null,
    outputs: savedOutputs(job, order).map((o) => ({
      providerAssetId: o.id,
      mediaType: o.contentType,
    })),
    error:
      job.status === "failed"
        ? "Comfy could not execute this workflow. Check model availability and your Cloud credits."
        : job.status === "expired"
          ? "This Comfy job has expired."
          : null,
  };
}
/** Submission failures without a definitive rejection must never be retried blindly. */
export function submissionFailure(error: unknown): {
  ambiguous: boolean;
  message: string;
} {
  const definitive =
    error instanceof ComfyError &&
    [400, 401, 402, 403, 404, 422, 429].includes(error.httpStatus ?? 0);
  return {
    ambiguous: !definitive,
    message:
      error instanceof ComfyError &&
      error.httpStatus === 403 &&
      error.message.includes("free tier")
        ? "Comfy Cloud API access is unavailable on the free tier. Use an API-enabled Comfy Cloud account to generate images."
        : definitive
          ? "Comfy Cloud rejected the request. Check your credentials, credits, and that the workflow's models are in your Cloud library."
          : "Submission could not be confirmed. Check Comfy Cloud before generating again; this request will not be resubmitted automatically.",
  };
}
/** Largest media file the Worker relays to Comfy Cloud (see LTX_ALPHA_LIMITS). */
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

/** `{ model, input: { graph, media } }` from a definition; a bare graph is the legacy form. */
function isCloudRequest(
  value: Record<string, unknown>,
): value is CloudWorkflowRequest & Record<string, unknown> {
  const input = value.input as Record<string, unknown> | undefined;
  return (
    typeof value.model === "string" &&
    !!input &&
    typeof input.graph === "object" &&
    Array.isArray(input.media)
  );
}

async function download(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Media download failed: ${response.status}`);
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (declared > MAX_MEDIA_BYTES)
    throw new Error("This clip is too large to send to Comfy Cloud");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES)
    throw new Error("This clip is too large to send to Comfy Cloud");
  return bytes;
}

/**
 * `POST /api/v2/assets`, returning the `core/ASSET` reference a loader input
 * takes. The SDK's own asset handles hash with a runtime-compiled WebAssembly
 * module, which Workers forbid; the hash is only a dedup hint, so it is skipped.
 */
async function uploadAsset(
  apiKey: string,
  media: CloudMediaInput,
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
) {
  // Metadata fields must precede the file part.
  const form = new FormData();
  form.append("content_type", media.contentType);
  form.append("file_path", media.filename);
  form.append(
    "file",
    new Blob([bytes], { type: media.contentType }),
    media.filename,
  );
  const response = await fetch(`${COMFY_CLOUD_BASE_URL}/api/v2/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  const asset: unknown = await response.json().catch(() => null);
  const id =
    asset && typeof asset === "object" && "id" in asset ? asset.id : null;
  if (!response.ok || typeof id !== "string")
    throw new ComfyError(
      `Comfy Cloud asset upload failed: ${response.status}`,
      {
        code: "asset_upload_failed",
        httpStatus: response.status,
      },
    );
  return {
    __type: "core/ASSET",
    info: { id, file_path: media.filename },
  };
}

/** Server-only adapter. Every call is bounded; the DO owns durable scheduling. */
export function createComfyClient(options: {
  apiKey: string;
  /** Node ids whose saved files are listed first, in this order. */
  outputNodes?: readonly string[] | undefined;
}) {
  const order = options.outputNodes ?? [];
  if (!options.apiKey.trim()) throw new Error("Comfy credentials are required");
  // The SDK stores fetch as an instance method; Workers requires the global receiver.
  const client = new Comfy({
    apiKey: options.apiKey,
    timeoutMs: 15_000,
    clientInfo: "open-cinema",
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  return {
    async submit(
      graph: Record<string, unknown>,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<ComfyJobStatus> {
      if (!idempotencyKey.trim())
        throw new Error("A persisted submission key is required");
      const workflow = isCloudRequest(graph)
        ? client.workflows.fromJson(structuredClone(graph.input.graph))
        : client.workflows.fromJson(graph);
      if (isCloudRequest(graph))
        for (const media of graph.input.media)
          workflow.setInput(
            media.node,
            media.field,
            await uploadAsset(
              options.apiKey,
              media,
              await download(media.url, signal),
              signal,
            ),
          );
      return status(
        await client.submit(workflow, { idempotencyKey, signal }),
        order,
      );
    },
    async getStatus(id: string): Promise<ComfyJobStatus> {
      return status(await client.jobs.get(id), order);
    },
    async cancel(id: string, signal: AbortSignal): Promise<ComfyJobStatus> {
      const job = await client.jobs.get(id);
      if (["queued", "running", "canceling"].includes(job.status))
        await job.cancel(signal);
      return status(await client.jobs.get(id), order);
    },
    async getOutputUrl(id: string, assetId: string): Promise<string | null> {
      const job = await client.jobs.get(id);
      const output = job.outputs.find((o) => o.id === assetId);
      if (!output) return null;
      const { url } = await output.getDownloadUrl();
      // Cloud downloads are signed HTTPS links, never provider credentials.
      return new URL(url).protocol === "https:" ? url : null;
    },
  };
}
