/**
 * A minimal ZIP writer and reader for world bundles, with no dependencies so
 * it runs in the Worker and the browser.
 *
 * The writer streams: entries are stored (media is already compressed), and
 * each entry's CRC and size follow its data in a data descriptor, so a large
 * video goes from R2 to the download without being held in memory. Bundles
 * stay under the classic 4 GB ZIP limits; there is no ZIP64.
 *
 * The reader works on a `Blob` (a chosen `File`) through slices, so a stored
 * entry is handed on as a slice of the original file without copying it. It
 * also reads deflated entries, so a bundle that was unpacked and re-zipped
 * with an operating system's archiver still opens.
 */

const LOCAL = 0x04034b50;
const DESCRIPTOR = 0x08074b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** Bit 3: sizes follow in a data descriptor. Bit 11: names are UTF-8. */
const FLAGS = 0x0008 | 0x0800;
const MAX_ZIP_BYTES = 0xffff_ffff;

export class ZipError extends Error {}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, previous = 0): number {
  let crc = ~previous >>> 0;
  for (let i = 0; i < data.length; i++)
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}

/** DOS date and time, which ZIP keeps per entry. */
function dosDateTime(date: Date) {
  const time =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2);
  const day =
    ((Math.max(1980, date.getUTCFullYear()) - 1980) << 9) |
    ((date.getUTCMonth() + 1) << 5) |
    date.getUTCDate();
  return { time, day };
}

export interface ZipSource {
  name: string;
  /** Opened only when the entry is written, so one R2 read is open at a time. */
  open: () => Promise<ReadableStream<Uint8Array> | Uint8Array | null>;
}

interface Written {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

/**
 * Streams a stored ZIP of `entries`. An entry whose `open` returns null is
 * left out and reported through `onMissing`, so one lost object does not fail
 * the whole download.
 */
export function zipStream(
  entries: readonly ZipSource[],
  options: { date?: Date; onMissing?: (name: string) => void } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(options.date ?? new Date());
  const written: Written[] = [];
  let offset = 0;
  let index = 0;
  let finished = false;

  const local = (name: Uint8Array) => {
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, LOCAL, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, FLAGS, true);
    header.setUint16(8, 0, true);
    header.setUint16(10, time, true);
    header.setUint16(12, day, true);
    // CRC and sizes stay zero here; the data descriptor carries them.
    header.setUint16(26, name.length, true);
    return concat(new Uint8Array(header.buffer), name);
  };

  const descriptor = (crc: number, size: number) => {
    const view = new DataView(new ArrayBuffer(16));
    view.setUint32(0, DESCRIPTOR, true);
    view.setUint32(4, crc, true);
    view.setUint32(8, size, true);
    view.setUint32(12, size, true);
    return new Uint8Array(view.buffer);
  };

  const central = () => {
    const parts: Uint8Array[] = [];
    let size = 0;
    for (const entry of written) {
      const view = new DataView(new ArrayBuffer(46));
      view.setUint32(0, CENTRAL, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, FLAGS, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, time, true);
      view.setUint16(14, day, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint32(42, entry.offset, true);
      const record = concat(new Uint8Array(view.buffer), entry.name);
      parts.push(record);
      size += record.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, END, true);
    end.setUint16(8, written.length, true);
    end.setUint16(10, written.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    parts.push(new Uint8Array(end.buffer));
    return concat(...parts);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      // A pull that enqueues nothing is not repeated, so skip missing
      // entries here until one opens or the archive ends.
      let entry: ZipSource | undefined;
      let opened: Awaited<ReturnType<ZipSource["open"]>> = null;
      while (!opened) {
        entry = entries[index++];
        if (!entry) {
          finished = true;
          controller.enqueue(central());
          controller.close();
          return;
        }
        opened = await entry.open();
        if (!opened) options.onMissing?.(entry.name);
      }
      const name = encoder.encode(entry!.name);
      const start = offset;
      const header = local(name);
      controller.enqueue(header);
      offset += header.length;
      let crc = 0;
      let size = 0;
      const emit = (chunk: Uint8Array) => {
        crc = crc32(chunk, crc);
        size += chunk.length;
        offset += chunk.length;
        if (offset > MAX_ZIP_BYTES)
          throw new ZipError("This world is larger than 4 GB.");
        controller.enqueue(chunk);
      };
      if (opened instanceof Uint8Array) emit(opened);
      else {
        const reader = opened.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          emit(value);
        }
      }
      const tail = descriptor(crc, size);
      controller.enqueue(tail);
      offset += tail.length;
      written.push({ name, crc, size, offset: start });
    },
  });
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export interface ZipEntry {
  name: string;
  size: number;
  /** The entry's bytes; a stored entry is a slice of the archive. */
  blob: () => Promise<Blob>;
}

async function view(blob: Blob, start: number, end: number) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

/** Lists a ZIP's files from its central directory. */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  // The end record is in the last 22 bytes plus at most a 64 KB comment.
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = await view(file, tailStart, file.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (tail.getUint32(i, true) === END) {
      end = i;
      break;
    }
  if (end < 0) throw new ZipError("This file is not a ZIP archive.");
  const count = tail.getUint16(end + 10, true);
  const dirSize = tail.getUint32(end + 12, true);
  const dirOffset = tail.getUint32(end + 16, true);
  if (count === 0xffff || dirOffset === 0xffffffff)
    throw new ZipError("This archive is too large to open here.");
  const dir = await view(file, dirOffset, dirOffset + dirSize);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > dir.byteLength || dir.getUint32(at, true) !== CENTRAL)
      throw new ZipError("This archive is damaged.");
    const method = dir.getUint16(at + 10, true);
    const crc = dir.getUint32(at + 16, true);
    const compressed = dir.getUint32(at + 20, true);
    const size = dir.getUint32(at + 24, true);
    const nameLength = dir.getUint16(at + 28, true);
    const extraLength = dir.getUint16(at + 30, true);
    const commentLength = dir.getUint16(at + 32, true);
    const localOffset = dir.getUint32(at + 42, true);
    const name = decoder.decode(
      new Uint8Array(dir.buffer, dir.byteOffset + at + 46, nameLength),
    );
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (method !== 0 && method !== 8)
      throw new ZipError(`${name} uses a compression this studio cannot read.`);
    entries.push({
      name,
      size,
      async blob() {
        const header = await view(file, localOffset, localOffset + 30);
        if (header.getUint32(0, true) !== LOCAL)
          throw new ZipError(`${name} is damaged in this archive.`);
        const start =
          localOffset +
          30 +
          header.getUint16(26, true) +
          header.getUint16(28, true);
        const raw = file.slice(start, start + compressed);
        const data =
          method === 0
            ? raw
            : await new Response(
                raw
                  .stream()
                  .pipeThrough(new DecompressionStream("deflate-raw")),
              ).blob();
        if (data.size !== size)
          throw new ZipError(`${name} is damaged in this archive.`);
        // Checking the CRC reads the entry once more; it is what tells a
        // truncated download apart from a whole one.
        let sum = 0;
        const reader = data.stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          sum = crc32(value, sum);
        }
        if (sum !== crc)
          throw new ZipError(`${name} is damaged in this archive.`);
        return data;
      },
    });
  }
  return entries;
}
