import { loopbackRelay } from "./relay";
import {
  MEDIA_GRAPH_INPUTS,
  MEDIA_GRAPH_OUTPUT,
  MEDIA_GRAPH_PARTS,
  mediaGraph,
  type MediaPartName,
} from "./workflows/media-graphs";
import type { MediaOperation } from "./workflows/types";

const COMFY_CLOUD_BASE_URL = "https://cloud.comfy.org";

/** Cloud ran the graph and it failed on these inputs; running it again cannot help. */
export class CloudMediaRejectedError extends Error {}

export interface CloudMediaPart {
  name: MediaPartName;
  contentType: string;
  /** Opened only when this part is uploaded, so no stream waits idle. */
  open(): Promise<{ body: ReadableStream<Uint8Array>; size: number }>;
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * One multipart field streamed with an exact length: Cloud's upload takes a
 * known Content-Length, and nothing is buffered.
 */
function multipart(
  part: { body: ReadableStream<Uint8Array>; size: number; contentType: string },
  filename: string,
) {
  const boundary = `----open-cinema-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ninput\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: ${part.contentType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const size = head.byteLength + part.size + tail.byteLength;
  const reader = part.body.getReader();
  let started = false;
  let total = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(head);
        return;
      }
      const chunk = await reader.read();
      if (chunk.done) {
        if (total !== part.size) throw new Error("Incomplete Cloud upload");
        controller.enqueue(tail);
        controller.close();
        reader.releaseLock();
      } else {
        total += chunk.value.byteLength;
        if (total > part.size) {
          await reader.cancel();
          throw new Error("Cloud upload exceeds declared size");
        }
        controller.enqueue(chunk.value);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return {
    body,
    size,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function json(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const message = `${what} failed: ${response.status} ${text.slice(0, 300)}`;
    // A graph Cloud refuses to validate is about these inputs, not the network.
    throw response.status === 400
      ? new CloudMediaRejectedError(message)
      : new Error(message);
  }
  return response.json();
}
const field = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (at, key) =>
      at && typeof at === "object"
        ? (at as Record<string, unknown>)[key]
        : undefined,
    value,
  );

/** The failing node's message from a Cloud job's execution log, if it has one. */
function executionError(job: unknown): string | null {
  const messages = field(job, "execution_status", "messages");
  if (!Array.isArray(messages)) return null;
  for (const entry of messages)
    if (Array.isArray(entry) && entry[0] === "execution_error") {
      const detail = entry[1] as Record<string, unknown> | undefined;
      return `${String(detail?.node_type ?? "A node")}: ${String(detail?.exception_message ?? "failed").slice(0, 300)}`;
    }
  return null;
}

/** Waits `ms`, or rejects when `signal` aborts; leaves no listener behind. */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** A status read that may succeed if repeated: the network or Cloud's own 5xx/429. */
async function readJob(url: string, headers: HeadersInit, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
  if (response.status >= 500 || response.status === 429) {
    await response.body?.cancel();
    return null;
  }
  return { job: await json(response, "Reading the media job") };
}

/**
 * Runs one media step (see workflows/media-graphs.ts) on Comfy Cloud and
 * streams its MP4 back. It uses Cloud's ComfyUI-compatible routes (upload,
 * prompt, jobs, view), which take the account's Comfy API key as `X-API-Key`.
 * Bounded by `signal`; the caller owns retries.
 */
export async function runCloudMedia(options: {
  apiKey: string;
  /** Development-only loopback relay; see loopbackRelay. */
  baseUrl?: string | undefined;
  operation: MediaOperation;
  parts: readonly CloudMediaPart[];
  pixelAspect?: number | null | undefined;
  /** `square` only; see MediaGraphOptions.minShortSide. */
  minShortSide?: number | null | undefined;
  signal: AbortSignal;
  /** Between status reads. */
  pollMs?: number;
}): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
  if (!options.apiKey.trim()) throw new Error("Comfy credentials are required");
  const base = loopbackRelay(options.baseUrl) ?? COMFY_CLOUD_BASE_URL;
  const { signal } = options;
  const headers = { "X-API-Key": options.apiKey };

  const files: Partial<Record<MediaPartName, string>> = {};
  for (const name of MEDIA_GRAPH_PARTS[options.operation]) {
    const part = options.parts.find((p) => p.name === name);
    if (!part) throw new Error(`The ${name} clip is missing`);
    const upload = multipart(
      { ...(await part.open()), contentType: part.contentType },
      `${name}-${crypto.randomUUID()}.${EXTENSIONS[part.contentType] ?? "mp4"}`,
    );
    const uploaded = await json(
      await fetch(`${base}/api/upload/image`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": upload.contentType,
          "Content-Length": String(upload.size),
        },
        body: upload.body,
        signal,
      }),
      `Uploading the ${name} clip`,
    );
    const file = field(uploaded, "name");
    const subfolder = field(uploaded, "subfolder");
    if (typeof file !== "string" || !file)
      throw new Error("Comfy Cloud returned no file name for an upload");
    files[name] =
      typeof subfolder === "string" && subfolder
        ? `${subfolder}/${file}`
        : file;
  }

  const graph = mediaGraph({
    operation: options.operation,
    files,
    pixelAspect: options.pixelAspect,
    minShortSide: options.minShortSide,
  });
  // Every loader the graph has was filled from an upload above.
  for (const name of MEDIA_GRAPH_PARTS[options.operation])
    if (!graph[MEDIA_GRAPH_INPUTS[name].node])
      throw new Error(`No ${name} loader`);
  const submitted = await json(
    await fetch(`${base}/api/prompt`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph }),
      signal,
    }),
    "Submitting the media graph",
  );
  const promptId = field(submitted, "prompt_id");
  if (typeof promptId !== "string")
    throw new Error("Comfy Cloud returned no job id");

  // The prompt is queued (and billed) now: a transient read error retries the
  // same job until `signal` ends, never posting the graph again.
  let job: unknown;
  for (;;) {
    const read = await readJob(
      `${base}/api/jobs/${encodeURIComponent(promptId)}`,
      headers,
      signal,
    );
    job = read?.job;
    const status = field(job, "status");
    if (status === "completed") break;
    if (status === "failed" || status === "cancelled" || status === "error")
      throw new CloudMediaRejectedError(
        executionError(job) ?? `The media job ${String(status)}`,
      );
    await sleep(options.pollMs ?? 2000, signal);
  }

  const saved = field(job, "outputs", MEDIA_GRAPH_OUTPUT, "images");
  const file = Array.isArray(saved)
    ? (saved[0] as Record<string, unknown>)
    : null;
  if (!file || typeof file.filename !== "string")
    throw new CloudMediaRejectedError("The media job saved no video");
  const query = new URLSearchParams({
    filename: file.filename,
    subfolder: typeof file.subfolder === "string" ? file.subfolder : "",
    type: "output",
  });
  // /api/view answers with a redirect to a signed storage link, which must not
  // receive the API key.
  const view = await fetch(`${base}/api/view?${query}`, {
    headers,
    redirect: "manual",
    signal,
  });
  const location = view.headers.get("location");
  const download =
    view.status >= 300 && view.status < 400 && location
      ? await fetch(new URL(location, base), { signal })
      : view;
  const size = Number(download.headers.get("content-length"));
  if (
    !download.ok ||
    !download.body ||
    !Number.isSafeInteger(size) ||
    size <= 0
  ) {
    await download.body?.cancel();
    throw new Error(`Downloading the media result failed: ${download.status}`);
  }
  return { body: download.body, size };
}
