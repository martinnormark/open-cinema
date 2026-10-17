/**
 * Takes the head off the front full-body panel of a Character sheet.
 *
 * On a wide panel the face is small and soft, and a model copies exactly that
 * face into wide shots. With it gone, the close portrait is the only face left
 * to learn from. FLUX 3 ignores "headless" in the prompt and refuses an edit
 * that removes a head, so this runs on the pixels instead: the backdrop is a
 * plain grey, so the figure separates from it by colour, the neck is the
 * narrowest point above the shoulders, and everything above the collar is
 * repainted with the backdrop on either side of it.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface HeadlessResult {
  /** Rows above this were repainted; null when no head was found. */
  cutRow: number | null;
  /** The repainted box, in image pixels. */
  box: { x0: number; x1: number; y0: number; y1: number } | null;
}

/** A pixel is figure, not backdrop, when a channel differs this much. */
const FOREGROUND_DIFFERENCE = 26;

function rowBackdrop(px: Pixels, y: number, from: number, to: number) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let x = from; x < to; x++) {
    const i = (y * px.width + x) * 4;
    sum[0]! += px.data[i]!;
    sum[1]! += px.data[i + 1]!;
    sum[2]! += px.data[i + 2]!;
    n++;
  }
  return sum.map((v) => v / Math.max(1, n)) as [number, number, number];
}

/**
 * Removes the head from the figure in columns [x0, x1) of the image, in place.
 * Sheets put the front view in the first of three equal panels.
 */
export function removeHead(
  px: Pixels,
  x0 = 0,
  x1 = Math.round(px.width / 3),
): HeadlessResult {
  const { data, width, height } = px;
  const panel = x1 - x0;
  const margin = Math.max(3, Math.round(panel * 0.04));
  const inset = Math.max(2, Math.round(panel * 0.01));
  const counts = new Float64Array(height);
  const spans: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    const left = rowBackdrop(px, y, x0 + inset, x0 + inset + margin);
    const right = rowBackdrop(px, y, x1 - inset - margin, x1 - inset);
    let count = 0;
    let first = -1;
    let last = -1;
    for (let x = x0 + inset + margin; x < x1 - inset - margin; x++) {
      const t = (x - x0) / panel;
      const i = (y * width + x) * 4;
      let diff = 0;
      for (let c = 0; c < 3; c++) {
        const bg = left[c]! + (right[c]! - left[c]!) * t;
        diff = Math.max(diff, Math.abs(data[i + c]! - bg));
      }
      if (diff > FOREGROUND_DIFFERENCE) {
        count++;
        if (first < 0) first = x;
        last = x;
      }
    }
    counts[y] = count;
    spans.push([first, last]);
  }
  // Smooth over a few rows so a stray hair or seam does not read as a neck.
  const widths = Array.from(counts, (_, y) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, y - 2); k <= Math.min(height - 1, y + 2); k++) {
      sum += counts[k]!;
      n++;
    }
    return sum / n;
  });
  const minFigure = panel * 0.02;
  const top = widths.findIndex((w) => w > minFigure);
  let bottom = height - 1;
  while (bottom > top && widths[bottom]! <= minFigure) bottom--;
  const none = { cutRow: null, box: null };
  if (top < 0 || bottom - top < height * 0.3) return none;
  const figure = bottom - top;

  // The torso, a third of the way down, sets the shoulder width.
  let torso = 0;
  for (let y = top + Math.round(figure * 0.2); y < top + figure * 0.4; y++)
    torso = Math.max(torso, widths[y]!);
  // Shoulders start where the width first passes 60% of the torso. The neck
  // is the narrowest row between the widest part of the head and them.
  let shoulders = top;
  while (shoulders < bottom && widths[shoulders]! < torso * 0.6) shoulders++;
  // A standing figure's head is about an eighth of its height. A figure cut
  // by the top edge may show only a chin, so search from there.
  let head = top;
  for (let y = top; top > 0 && y < Math.min(shoulders, top + figure * 0.1); y++)
    if (widths[y]! > widths[head]!) head = y;
  let neck = -1;
  for (let y = head; y < shoulders; y++)
    if (neck < 0 || widths[y]! < widths[neck]!) neck = y;
  if (neck < 0 || widths[neck]! > torso * 0.5) return none;
  // The collar is where the neck starts widening into the shoulders.
  let cut = neck;
  while (cut < shoulders && widths[cut]! < widths[neck]! * 1.5) cut++;

  let headMin = Infinity;
  let headMax = -Infinity;
  let headWidth = 0;
  for (let y = 0; y < cut; y++) {
    const [first, last] = spans[y]!;
    if (first < 0) continue;
    headMin = Math.min(headMin, first);
    headMax = Math.max(headMax, last);
    headWidth = Math.max(headWidth, widths[y]!);
  }
  if (!Number.isFinite(headMin)) return none;
  // Light hair on grey barely differs from the backdrop, so pad generously.
  const pad = Math.max(6, Math.round(headWidth * 0.3));
  const bx0 = Math.max(x0 + 1, headMin - pad);
  const bx1 = Math.min(x1 - 2, headMax + pad);
  const sample = Math.max(3, Math.round(pad / 4));

  // A deterministic grain so the patch does not read as flatter than the frame.
  let seed = 0x9e3779b9;
  const grain = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff - 0.5) * 3;
  };
  // The bottom rows fade into the original backdrop so the patch leaves no
  // edge beside the shoulders; figure pixels there are still replaced.
  const feather = Math.max(4, Math.round(height * 0.012));
  for (let y = 0; y < cut; y++) {
    const fade = Math.min(1, (cut - y) / feather);
    const [first, last] = spans[y]!;
    const left = rowBackdrop(px, y, Math.max(x0, bx0 - sample), bx0);
    const right = rowBackdrop(px, y, bx1 + 1, Math.min(x1, bx1 + 1 + sample));
    for (let x = bx0; x <= bx1; x++) {
      const t = (x - bx0) / Math.max(1, bx1 - bx0);
      const i = (y * width + x) * 4;
      const g = grain();
      const a = first >= 0 && x >= first - 2 && x <= last + 2 ? 1 : fade;
      for (let c = 0; c < 3; c++) {
        const fill = left[c]! + (right[c]! - left[c]!) * t + g;
        data[i + c] = data[i + c]! + (fill - data[i + c]!) * a;
      }
    }
  }
  return { cutRow: cut, box: { x0: bx0, x1: bx1, y0: 0, y1: cut } };
}

export interface HeadlessSheet {
  file: File;
  url: string;
  result: HeadlessResult;
}

/** Decodes, edits and re-encodes off the main thread when it can. */
export async function headlessPng(
  blob: Blob,
): Promise<{ png: Blob; result: HeadlessResult }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot edit images.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = removeHead(image);
  context.putImageData(image, 0, 0);
  return { png: await canvas.convertToBlob({ type: "image/png" }), result };
}

function inWorker(blob: Blob): Promise<{ png: Blob; result: HeadlessResult }> {
  if (typeof Worker === "undefined") return headlessPng(blob);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./headless.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.onmessage = (event: MessageEvent) => {
      worker.terminate();
      const data = event.data as
        { png: Blob; result: HeadlessResult } | { error: string };
      if ("error" in data) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = () => {
      worker.terminate();
      // Fall back to this thread rather than lose the sheet.
      headlessPng(blob).then(resolve, reject);
    };
    worker.postMessage(blob);
  });
}

export type HeadlessOutcome = HeadlessSheet | { error: string };

const sheets = new Map<string, Promise<HeadlessOutcome>>();

/**
 * The generated sheet with the front figure's head removed, as a PNG ready
 * to upload. Cached per source so a re-render reuses the same image; it never
 * rejects, so a component can `use` it without an error boundary.
 */
export function headlessSheet(
  source: string,
  name: string,
): Promise<HeadlessOutcome> {
  const cached = sheets.get(source);
  if (cached) return cached;
  const work = (async (): Promise<HeadlessOutcome> => {
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error("The sheet image could not be loaded.");
      const { png, result } = await inWorker(await response.blob());
      const file = new File([png], `${name}.png`, { type: "image/png" });
      return { file, url: URL.createObjectURL(file), result };
    } catch (error) {
      // Ask again later rather than keep the failure.
      sheets.delete(source);
      return {
        error:
          error instanceof Error
            ? error.message
            : "The heads could not be removed from this sheet.",
      };
    }
  })();
  sheets.set(source, work);
  return work;
}
