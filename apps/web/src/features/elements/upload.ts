const MAX_EDGE = 1024;
export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp";

/** Downscales an uploaded image so interim browser storage can hold a full sheet. */
export async function readReferenceImage(file: File): Promise<string> {
  if (!ACCEPTED_IMAGES.split(",").includes(file.type))
    throw new Error(`${file.name} is not a PNG, JPEG or WebP image.`);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} could not be read as an image.`);
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
