import {
  ALLOWED_UPLOAD_MEDIA_TYPES,
  MAX_UPLOAD_BYTES,
} from "@open-cinema/contracts";
import { mediaItemSchema } from "@/features/library/model";

export const ACCEPTED_IMAGES = ALLOWED_UPLOAD_MEDIA_TYPES.image.join(",");

async function dimensions(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Streams an image into the Library's upload route and returns its asset id. */
export async function uploadReferenceImage(file: File): Promise<string> {
  if (
    !(ALLOWED_UPLOAD_MEDIA_TYPES.image as readonly string[]).includes(file.type)
  )
    throw new Error(`${file.name} is not a PNG, JPEG or WebP image.`);
  if (file.size > MAX_UPLOAD_BYTES.image)
    throw new Error(`${file.name} is larger than 25 MB.`);
  const size = await dimensions(file);
  const response = await fetch("/api/media/upload", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": file.type,
      "X-Media-Filename": encodeURIComponent(file.name),
      ...(size
        ? {
            "X-Media-Width": String(size.width),
            "X-Media-Height": String(size.height),
          }
        : {}),
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `${file.name} could not be uploaded. Try again.`;
    throw new Error(error);
  }
  return mediaItemSchema.parse(body).id;
}
