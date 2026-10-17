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
