import { comfy, routerErrors } from "@comfyorg/sdk";
import {
  createComfyClient as createCloudClient,
  submissionFailure as cloudSubmissionFailure,
} from "./cloud-workflow";
import type { ComfyJobStatus } from "./cloud-workflow";
export type { ComfyJobStatus } from "./cloud-workflow";
export * from "./workflows/router-request";
export * from "./workflows/flux-image";
export * from "./workflows/flux-reference";
export * from "./workflows/ltx-video";
export * from "./estimates";

export const ROUTER_MODEL = "bfl/flux-3-image";
/** Verified against Router's published model schema. No seed field is accepted. */
export function fluxRouterRequest(prompt: string) {
  return {
    model: ROUTER_MODEL,
    input: { prompt, aspect_ratio: "1:1", resolution: "1k", grounding: false },
  };
}
export function mapProviderState(status: string): ComfyJobStatus["state"] {
  if (status === "IN_QUEUE") return "queued";
  if (status === "IN_PROGRESS") return "running";
  // COMPLETED must also be checked for error_type and a valid result.
  return "needs_attention";
}
function failureMessage(errorType: string) {
  switch (errorType) {
    case "not_enabled":
      return "Queued Router requests are not enabled for this Comfy account.";
    case "insufficient_credits":
      return "There are not enough Comfy credits for this generation.";
    case "unauthorized":
    case "forbidden":
      return "Comfy Router rejected these credentials. Check the jobs Worker API key.";
    case "content_policy_violation":
      return "Comfy could not generate this prompt under its content policy. Try a different prompt.";
    case "invalid_input":
      return "Comfy rejected the model inputs. Check the Router model schema.";
    default:
      return "Comfy Router could not complete this generation. Check your account and try again.";
  }
}
export function submissionFailure(error: unknown, provider = "router") {
  if (provider === "cloud-workflow") return cloudSubmissionFailure(error);
  const definitive =
    error instanceof routerErrors.RouterError &&
    [400, 401, 402, 403, 404, 422].includes(error.httpStatus ?? 0);
  return {
    ambiguous: !definitive,
    message: definitive
      ? failureMessage(error.errorType)
      : "Waiting to recover the Router receipt using the original request key.",
  };
}
/** BFL models return `result.sample`; LTX returns `result.video_url`. */
function sample(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("result" in data)) return null;
  const result = data.result;
  if (!result || typeof result !== "object") return null;
  const value =
    "sample" in result && typeof result.sample === "string"
      ? result.sample
      : "video_url" in result && typeof result.video_url === "string"
        ? result.video_url
        : null;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function mediaType(url: string) {
  const path = new URL(url).pathname.toLowerCase();
  return path.endsWith(".png")
    ? "image/png"
    : /\.jpe?g$/.test(path)
      ? "image/jpeg"
      : path.endsWith(".webp")
        ? "image/webp"
        : path.endsWith(".mp4")
          ? "video/mp4"
          : path.endsWith(".webm")
            ? "video/webm"
            : "image/*";
}
/** SDK calls stay bounded; durable alarms own retries and polling. */
export function createComfyClient(options: {
  apiKey: string;
  provider?: "router" | "cloud-workflow";
  workflow?: Record<string, unknown>;
}) {
  if (options.provider === "cloud-workflow") return createCloudClient(options);
  if (!options.apiKey.trim()) throw new Error("Comfy credentials are required");
  // SDK 0.5 exposes Router configuration at module scope. Every coordinator uses
  // the SAME Worker secret, never a caller-supplied key. BYOK requires an isolated client.
  comfy.config({
    credentials: options.apiKey,
    baseUrl: "https://api.comfy.org",
  });
  const model = options.workflow?.model ?? ROUTER_MODEL;
  if (typeof model !== "string")
    throw new Error("Invalid persisted Router model");
  const request = (id: string) => comfy.models.handle(model, id);
  const bounded = () => ({
    timeoutMs: 15_000,
    retry: false as const,
    signal: AbortSignal.timeout(15_000),
  });
  async function getStatus(id: string): Promise<ComfyJobStatus> {
    const handle = request(id);
    const update = await handle.status(bounded());
    const result: ComfyJobStatus = {
      providerJobId: id,
      state: mapProviderState(update.status),
      progress: null,
      outputs: [],
      error: null,
    };
    if (!update.completed) return result;
    if (update.errorType) {
      result.state = update.errorType === "cancelled" ? "cancelled" : "failed";
      result.error =
        result.state === "failed" ? failureMessage(update.errorType) : null;
      return result;
    }
    try {
      const output = await handle.get(bounded());
      const url = sample(output.data);
      if (!url) {
        return {
          ...result,
          state: "failed",
          error: "Comfy completed the request without a usable output.",
        };
      }
      return {
        ...result,
        state: "succeeded",
        progress: 1,
        outputs: [{ providerAssetId: "sample", mediaType: mediaType(url) }],
      };
    } catch (error) {
      // A terminal error can appear only in the result document. Transport errors
      // must reach the coordinator's read retry path, not become failed generations.
      if (
        error instanceof routerErrors.RouterError &&
        error.httpStatus === null
      ) {
        return {
          ...result,
          state: error.errorType === "cancelled" ? "cancelled" : "failed",
          error:
            error.errorType === "cancelled"
              ? null
              : failureMessage(error.errorType),
        };
      }
      throw error;
    }
  }
  return {
    async submit(
      recipe: Record<string, unknown>,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<ComfyJobStatus> {
      if (!idempotencyKey.trim())
        throw new Error("A persisted submission key is required");
      if (
        recipe.model !== model ||
        !recipe.input ||
        typeof recipe.input !== "object" ||
        Array.isArray(recipe.input)
      )
        throw new Error("Invalid Router request snapshot");
      const handle = await comfy.models.submit(
        model,
        recipe.input as Record<string, unknown>,
        { idempotencyKey, signal, timeoutMs: 15_000, retry: false },
      );
      // Save the receipt before any status/result request, including an immediate completion.
      return {
        providerJobId: handle.requestId,
        state: "queued",
        progress: null,
        outputs: [],
        error: null,
      };
    },
    getStatus,
    async cancel(id: string, signal: AbortSignal) {
      const handle = request(id);
      const status = await handle.status({ ...bounded(), signal });
      if (!status.completed) await handle.cancel({ ...bounded(), signal });
      return getStatus(id);
    },
    async getOutputUrl(id: string, assetId: string): Promise<string | null> {
      if (assetId !== "sample") return null;
      return sample((await request(id).get(bounded())).data);
    },
  };
}
