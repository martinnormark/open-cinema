/**
 * Reads duration and frame size from MP4/MOV container boxes without decoding,
 * for browsers that cannot play the codec (for example H.264 or HEVC in
 * Chromium builds without proprietary codecs). Reads only box headers plus the
 * `moov` box, which is small even for long videos.
 */
export interface ContainerMeta {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

const MAX_MOOV_BYTES = 8 * 1024 * 1024;

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

export async function readContainerMeta(
  file: Blob,
): Promise<ContainerMeta | null> {
  const moov = await findMoov(file);
  if (!moov) return null;
  const meta: ContainerMeta = {
    durationSeconds: null,
    width: null,
    height: null,
  };
  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      const size = boxSize(moov, offset, end - offset);
      if (size < 8 || offset + size > end) return;
      const kind = type(moov, offset + 4);
      const body = offset + 8;
      if (kind === "trak") walk(body, offset + size);
      else if (kind === "mvhd") {
        const v1 = moov.getUint8(body) === 1;
        const scale = moov.getUint32(body + (v1 ? 20 : 12));
        const duration = v1
          ? Number(moov.getBigUint64(body + 24))
          : moov.getUint32(body + 16);
        if (scale) meta.durationSeconds = duration / scale;
      } else if (kind === "tkhd") {
        // Width and height are the last two 16.16 fixed-point fields.
        const width = moov.getUint32(offset + size - 8) / 65536;
        const height = moov.getUint32(offset + size - 4) / 65536;
        if (width * height > (meta.width ?? 0) * (meta.height ?? 0)) {
          meta.width = Math.round(width);
          meta.height = Math.round(height);
        }
      }
      offset += size;
    }
  };
  walk(8, moov.byteLength);
  return meta;
}
