import { loopbackRelay } from "./relay";
import { httpsUrl } from "./workflows/results";

/**
 * Comfy's API-node storage: a short-lived (about 24 h) signed download URL for
 * bytes a provider must fetch by URL. Used when the deployment has no public
 * media origin of its own (local development, generated clips).
 */
export async function uploadToComfyStorage(options: {
  apiKey: string;
  baseUrl: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  body: ReadableStream<Uint8Array>;
  signal?: AbortSignal;
}): Promise<string> {
  const relay = loopbackRelay(options.baseUrl);
  if (relay) return uploadThroughRelay(relay, options);
  const slot = await fetch(`${options.baseUrl}/customers/storage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: options.fileName,
      content_type: options.contentType,
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!slot.ok) throw new Error(`Comfy storage slot failed: ${slot.status}`);
  const document: unknown = await slot.json();
  const field = (name: string) =>
    document && typeof document === "object" && name in document
      ? httpsUrl((document as Record<string, unknown>)[name])
      : null;
  const uploadUrl = field("upload_url");
  const downloadUrl = field("download_url");
  if (!uploadUrl || !downloadUrl)
    throw new Error("Comfy storage returned no usable upload slot");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": options.contentType,
      "Content-Length": String(options.sizeBytes),
    },
    body: options.body,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!put.ok) throw new Error(`Comfy storage upload failed: ${put.status}`);
  return downloadUrl;
}

/**
 * Behind the development relay only: a container's egress proxy may refuse the
 * storage slot's direct PUT, so the bytes go to Comfy Cloud's input folder
 * through the relay instead, and Cloud's own signed link to them is returned
 * (about the same lifetime). See loopbackRelay.
 */
async function uploadThroughRelay(
  relay: string,
  options: Parameters<typeof uploadToComfyStorage>[0],
): Promise<string> {
  // Buffered: workerd cannot pipe one transform stream into another, and
  // this path only runs in development.
  const form = new FormData();
  form.append("type", "input");
  form.append("overwrite", "true");
  form.append(
    "image",
    new Blob([await new Response(options.body).arrayBuffer()], {
      type: options.contentType,
    }),
    options.fileName,
  );
  const response = await fetch(`${relay}/api/upload/image`, {
    method: "POST",
    body: form,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const uploaded = (await response.json().catch(() => null)) as {
    name?: string;
    subfolder?: string;
  } | null;
  if (!response.ok || !uploaded?.name)
    throw new Error(`Comfy Cloud upload failed: ${response.status}`);
  const query = new URLSearchParams({
    filename: uploaded.name,
    type: "input",
    ...(uploaded.subfolder ? { subfolder: uploaded.subfolder } : {}),
  });
  const view = await fetch(`${relay}/api/view?${query}`, {
    redirect: "manual",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const url = httpsUrl(view.headers.get("location"));
  if (!url) throw new Error(`Comfy Cloud gave no link: ${view.status}`);
  return url;
}
