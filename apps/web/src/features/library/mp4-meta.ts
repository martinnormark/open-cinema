/**
 * Reads duration, frame size, frame rate, pixel aspect and whether there is a
 * sound track from MP4/MOV container boxes without decoding, so the studio
 * knows what Kling will see (and browsers that cannot play the codec, such as
 * Chromium builds without H.264 or HEVC, still get duration and size). Reads
 * only box headers plus the `moov` box, which is small even for long videos.
 */
export interface ContainerMeta {
  durationSeconds: number | null;
  /** Display size from the track header: what a player shows. */
  width: number | null;
  height: number | null;
  /** Stored (coded) size from the sample description: what a decoder reads. */
  codedWidth: number | null;
  codedHeight: number | null;
  /** Sample aspect ratio (`pasp`); 1 means square pixels. */
  pixelAspect: number | null;
  fps: number | null;
  hasAudio: boolean;
}

const MAX_MOOV_BYTES = 8 * 1024 * 1024;
const CONTAINERS = new Set(["trak", "mdia", "minf", "stbl"]);

async function bytes(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}
function type(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}
function boxSize(view: DataView, offset: number, remaining: number) {
  const size = view.getUint32(offset);
  if (size === 1) return Number(view.getBigUint64(offset + 8));
  return size === 0 ? remaining : size;
}

async function findMoov(file: Blob) {
  let offset = 0;
  while (offset + 16 <= file.size) {
    const header = await bytes(file, offset, offset + 16);
    const size = boxSize(header, 0, file.size - offset);
    if (size < 8) return null;
    if (type(header, 4) === "moov")
      return size <= MAX_MOOV_BYTES ? bytes(file, offset, offset + size) : null;
    offset += size;
  }
  return null;
}

interface Track {
  handler: string;
  width: number;
  height: number;
  codedWidth: number | null;
  codedHeight: number | null;
  pixelAspect: number | null;
  timescale: number;
  duration: number;
  samples: number;
}

/** Parses a `moov` box already in memory; exported for tests. */
export function parseMoov(moov: DataView): ContainerMeta {
  let durationSeconds: number | null = null;
  const tracks: Track[] = [];
  let track: Track | null = null;
  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      const size = boxSize(moov, offset, end - offset);
      if (size < 8 || offset + size > end) return;
      const kind = type(moov, offset + 4);
      const body = offset + 8;
      if (kind === "trak") {
        track = {
          handler: "",
          width: 0,
          height: 0,
          codedWidth: null,
          codedHeight: null,
          pixelAspect: null,
          timescale: 0,
          duration: 0,
          samples: 0,
        };
        tracks.push(track);
        walk(body, offset + size);
        track = null;
      } else if (CONTAINERS.has(kind)) walk(body, offset + size);
      else if (kind === "mvhd") {
        const v1 = moov.getUint8(body) === 1;
        const scale = moov.getUint32(body + (v1 ? 20 : 12));
        const duration = v1
          ? Number(moov.getBigUint64(body + 24))
          : moov.getUint32(body + 16);
        if (scale) durationSeconds = duration / scale;
      } else if (track) {
        const t: Track = track;
        if (kind === "tkhd") {
          // Width and height are the last two 16.16 fixed-point fields.
          t.width = moov.getUint32(offset + size - 8) / 65536;
          t.height = moov.getUint32(offset + size - 4) / 65536;
        } else if (kind === "hdlr") {
          t.handler = type(moov, body + 8);
        } else if (kind === "mdhd") {
          const v1 = moov.getUint8(body) === 1;
          t.timescale = moov.getUint32(body + (v1 ? 20 : 12));
          t.duration = v1
            ? Number(moov.getBigUint64(body + 24))
            : moov.getUint32(body + 16);
        } else if (kind === "stts") {
          const count = moov.getUint32(body + 4);
          for (let i = 0; i < count && body + 16 + i * 8 <= offset + size; i++)
            t.samples += moov.getUint32(body + 8 + i * 8);
        } else if (kind === "stsd" && t.handler === "vide") {
          // The first visual sample entry: 78 bytes of fields, then child boxes.
          const entry = body + 8;
          const entryEnd = entry + boxSize(moov, entry, offset + size - entry);
          if (entryEnd <= offset + size && entry + 8 + 78 <= entryEnd) {
            t.codedWidth = moov.getUint16(entry + 8 + 24);
            t.codedHeight = moov.getUint16(entry + 8 + 26);
            let child = entry + 8 + 78;
            while (child + 8 <= entryEnd) {
              const childSize = boxSize(moov, child, entryEnd - child);
              if (childSize < 8 || child + childSize > entryEnd) break;
              if (type(moov, child + 4) === "pasp" && childSize >= 16) {
                const h = moov.getUint32(child + 8);
                const v = moov.getUint32(child + 12);
                if (h && v) t.pixelAspect = h / v;
              }
              child += childSize;
            }
          }
        }
      }
      offset += size;
    }
  };
  walk(8, moov.byteLength);
  const video = tracks
    .filter((t) => t.handler === "vide" || (!t.handler && t.width))
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const seconds = video?.timescale ? video.duration / video.timescale : 0;
  return {
    durationSeconds,
    width: video?.width ? Math.round(video.width) : null,
    height: video?.height ? Math.round(video.height) : null,
    codedWidth: video?.codedWidth || null,
    codedHeight: video?.codedHeight || null,
    // Without `pasp`, a coded size that differs from the display size implies one.
    pixelAspect:
      video?.pixelAspect ??
      (video?.codedWidth &&
      video.codedHeight === Math.round(video.height) &&
      Math.round(video.width) !== video.codedWidth
        ? video.width / video.codedWidth
        : video?.codedWidth
          ? 1
          : null),
    fps: video?.samples && seconds > 0 ? video.samples / seconds : null,
    hasAudio: tracks.some((t) => t.handler === "soun"),
  };
}

export async function readContainerMeta(
  file: Blob,
): Promise<ContainerMeta | null> {
  const moov = await findMoov(file);
  return moov ? parseMoov(moov) : null;
}
