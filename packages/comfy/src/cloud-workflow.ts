import { Comfy, ComfyError, type Job as ProviderJob } from "@comfyorg/sdk";
import type { JobState } from "@open-cinema/contracts";
import { loopbackRelay } from "./relay";
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
  baseUrl: string,
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
  const response = await fetch(`${baseUrl}/api/v2/assets`, {
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

const MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

interface SavedFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

/** `{node}|{subfolder}|{filename}`: stable, and enough to fetch the file again. */
function compatAssetId(node: string, file: SavedFile) {
  return [node, file.subfolder ?? "", file.filename].join("|");
}

function compatState(status: unknown): JobState {
  switch (status) {
    case "pending":
    case "queued":
      return "queued";
    case "in_progress":
    case "running":
      return "running";
    case "completed":
    case "success":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "error":
      return "failed";
    default:
      return "needs_attention";
  }
}

/**
 * The same Cloud graphs through ComfyUI's own routes (`/api/upload/image`,
 * `/api/prompt`, `/api/jobs`, `/api/view`), which the media steps use too.
 * Used only behind the development relay: a container's proxy-injected Cloud
 * credential is refused by the `/api/v2` routes the SDK calls (foundation.md),
 * so this is what lets a local stack run Cloud graphs end to end.
 */
function createCompatClient(baseUrl: string, order: readonly string[]) {
  async function read(id: string, signal?: AbortSignal) {
    const response = await fetch(
      `${baseUrl}/api/jobs/${encodeURIComponent(id)}`,
      { signal: signal ?? AbortSignal.timeout(15_000) },
    );
    if (!response.ok)
      throw new Error(`Reading the Cloud job failed: ${response.status}`);
    return (await response.json()) as {
      status?: string;
      outputs?: Record<
        string,
        Record<string, SavedFile[] | unknown> | undefined
      >;
      execution_status?: { messages?: unknown[] };
    };
  }
  function files(job: Awaited<ReturnType<typeof read>>) {
    const listed: { id: string; mediaType: string }[] = [];
    const nodes = Object.keys(job.outputs ?? {}).filter(
      (node) => !order.length || order.includes(node),
    );
    nodes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const node of nodes)
      for (const value of Object.values(job.outputs?.[node] ?? {}))
        if (Array.isArray(value))
          for (const file of value as SavedFile[])
            if (
              file &&
              typeof file.filename === "string" &&
              file.type !== "temp"
            )
              listed.push({
                id: compatAssetId(node, file),
                mediaType:
                  MEDIA_TYPES[
                    file.filename.split(".").pop()?.toLowerCase() ?? ""
                  ] ?? "application/octet-stream",
              });
    return listed;
  }
  function failure(job: Awaited<ReturnType<typeof read>>) {
    for (const entry of job.execution_status?.messages ?? [])
      if (Array.isArray(entry) && entry[0] === "execution_error") {
        const detail = entry[1] as Record<string, unknown> | undefined;
        return `${String(detail?.node_type ?? "A node")}: ${String(detail?.exception_message ?? "failed").slice(0, 300)}`;
      }
    return "Comfy could not execute this workflow. Check model availability and your Cloud credits.";
  }
  async function getStatus(id: string): Promise<ComfyJobStatus> {
    const job = await read(id);
    const state = compatState(job.status);
    return {
      providerJobId: id,
      state,
      progress: state === "succeeded" ? 1 : null,
      outputs:
        state === "succeeded"
          ? files(job).map((f) => ({
              providerAssetId: f.id,
              mediaType: f.mediaType,
            }))
          : [],
      error: state === "failed" ? failure(job) : null,
    };
  }
  return {
    async submit(
      graph: Record<string, unknown>,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<ComfyJobStatus> {
      if (!idempotencyKey.trim())
        throw new Error("A persisted submission key is required");
      const prompt = structuredClone(
        isCloudRequest(graph) ? graph.input.graph : graph,
      ) as Record<string, { inputs: Record<string, unknown> }>;
      if (isCloudRequest(graph))
        for (const media of graph.input.media) {
          const form = new FormData();
          form.append("type", "input");
          form.append("overwrite", "true");
          form.append(
            "image",
            new Blob([await download(media.url, signal)], {
              type: media.contentType,
            }),
            `${crypto.randomUUID()}-${media.filename}`,
          );
          const response = await fetch(`${baseUrl}/api/upload/image`, {
            method: "POST",
            body: form,
            signal,
          });
          const uploaded = (await response.json().catch(() => null)) as {
            name?: string;
            subfolder?: string;
          } | null;
          if (!response.ok || !uploaded?.name)
            throw new ComfyError(
              `Comfy Cloud upload failed: ${response.status}`,
              { code: "asset_upload_failed", httpStatus: response.status },
            );
          const node = prompt[media.node];
          if (!node) throw new Error(`The graph has no ${media.node} loader`);
          node.inputs[media.field] = uploaded.subfolder
            ? `${uploaded.subfolder}/${uploaded.name}`
            : uploaded.name;
        }
      const response = await fetch(`${baseUrl}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal,
      });
      const submitted = (await response.json().catch(() => null)) as {
        prompt_id?: string;
      } | null;
      if (!response.ok || !submitted?.prompt_id)
        throw new ComfyError(
          `Comfy Cloud rejected the graph: ${response.status} ${JSON.stringify(submitted).slice(0, 300)}`,
          { code: "prompt_rejected", httpStatus: response.status },
        );
      return {
        providerJobId: submitted.prompt_id,
        state: "queued",
        progress: null,
        outputs: [],
        error: null,
      };
    },
    getStatus,
    async cancel(id: string, signal: AbortSignal): Promise<ComfyJobStatus> {
      await fetch(`${baseUrl}/api/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: [id] }),
        signal,
      }).catch(() => undefined);
      return getStatus(id);
    },
    async getOutputUrl(id: string, assetId: string): Promise<string | null> {
      const [node, subfolder = "", filename] = assetId.split("|");
      if (!node || !filename) return null;
      const job = await read(id);
      if (!files(job).some((f) => f.id === assetId)) return null;
      const query = new URLSearchParams({
        filename,
        subfolder,
        type: "output",
      });
      // /api/view redirects to a signed storage link that carries no credential.
      const view = await fetch(`${baseUrl}/api/view?${query}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const location = view.headers.get("location");
      await view.body?.cancel();
      if (!location) return null;
      const url = new URL(location, baseUrl);
      return url.protocol === "https:" ? url.toString() : null;
    },
  };
}

/** Server-only adapter. Every call is bounded; the DO owns durable scheduling. */
export function createComfyClient(options: {
  apiKey: string;
  /** Node ids whose saved files are listed first, in this order. */
  outputNodes?: readonly string[] | undefined;
  /**
   * Development-only loopback relay. The SDK itself reads COMFY_BASE_URL from
   * the environment; uploads made here must follow it to the same place.
   */
  baseUrl?: string | undefined;
}) {
  const order = options.outputNodes ?? [];
  const relay = loopbackRelay(options.baseUrl);
  const baseUrl = relay ?? COMFY_CLOUD_BASE_URL;
  if (!options.apiKey.trim()) throw new Error("Comfy credentials are required");
  if (relay) return createCompatClient(relay, order);
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
              baseUrl,
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
