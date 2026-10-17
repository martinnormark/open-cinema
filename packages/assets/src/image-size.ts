/** Bytes from the start of a file that always cover the size of the images we store. */
export const IMAGE_HEADER_BYTES = 64 * 1024;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Reads the pixel size from the first bytes of a PNG, JPEG or WebP file, or
 * null when the format is unknown or the header is cut short.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, length: number) =>
    String.fromCharCode(...bytes.subarray(at, at + length));
  const size = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null;
  if (bytes.length >= 24 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR")
    return size(view.getUint32(16), view.getUint32(20));
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ")
      return size(
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
      );
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8X")
      return size(
        1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
        1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
      );
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 <= bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1]!;
      // Start-of-frame markers carry the size; DHT, JPG and DAC share the range.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      )
        return size(view.getUint16(at + 7), view.getUint16(at + 5));
      at += 2 + view.getUint16(at + 2);
    }
  }
  return null;
}
