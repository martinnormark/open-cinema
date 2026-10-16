import { Comfy, ComfyError, type Job as ProviderJob } from "@comfyorg/sdk";
import type { JobState } from "@open-cinema/contracts";
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
function status(job: ProviderJob): ComfyJobStatus {
  const value = job.progress?.value;
  return {
    providerJobId: job.id,
    state: mapProviderState(job.status),
    progress:
      value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : null,
    outputs: job.outputs.map((o) => ({
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
          ? "Comfy rejected the request. Check your credentials, credits, and FLUX 3 Klein model availability."
          : "Submission could not be confirmed. Check Comfy Cloud before generating again; this request will not be resubmitted automatically.",
  };
}
/** Server-only adapter. Every call is bounded; the DO owns durable scheduling. */
export function createComfyClient(options: { apiKey: string }) {
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
      return status(
        await client.submit(client.workflows.fromJson(graph), {
          idempotencyKey,
          signal,
        }),
      );
    },
    async getStatus(id: string): Promise<ComfyJobStatus> {
      return status(await client.jobs.get(id));
    },
    async cancel(id: string, signal: AbortSignal): Promise<ComfyJobStatus> {
      const job = await client.jobs.get(id);
      if (["queued", "running", "canceling"].includes(job.status))
        await job.cancel(signal);
      return status(await client.jobs.get(id));
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
