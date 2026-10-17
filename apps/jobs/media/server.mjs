// Media container for the jobs Worker: ffmpeg steps that no Router model offers.
//
//   POST /lock     parts source, edit, matte -> the source foreground over the edit
//   POST /conform  parts source, edit        -> the edit on the source's frame grid
//   POST /square   parts source              -> the source with square pixels
//   POST /poster   parts source              -> a WebP still of the source
//
// The video operations return an MP4 on the source's exact frame rate and frame count, at its
// display size with square pixels, carrying the source's audio. The request body is the parts concatenated in the order
// the `x-media-parts` header lists them (`source=123,edit=456`), so the Worker
// can stream R2 objects in without buffering.
//
// /poster returns a WebP at most 640 px wide, taken a moment in so it is not a
// black first frame, with the clip's display size and length in headers.
//
// Offline: node server.mjs lock|conform|square|poster <out> <source> [edit] [matte]
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const OPERATIONS = {
  lock: ["source", "edit", "matte"],
  conform: ["source", "edit"],
  square: ["source"],
  poster: ["source"],
};
const POSTER_WIDTH = 640;
const MAX_PART_BYTES = 512 * 1024 * 1024;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

async function probe(path) {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-count_packets",
    "-show_streams",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    path,
  ]);
  const parsed = JSON.parse(out);
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${path} has no video stream`);
  const audio = streams.find((s) => s.codec_type === "audio") ?? null;
  // A non-square sample aspect (e.g. 639:640) displays wider or narrower than
  // it is stored. Providers misread such clips, so every output is resampled
  // to its display size (what a player shows) with square pixels, even-sized.
  const [sarW, sarH] = String(video.sample_aspect_ratio ?? "1:1")
    .split(":")
    .map(Number);
  const sar = sarW > 0 && sarH > 0 ? sarW / sarH : 1;
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return {
    width: even(video.width * sar),
    height: even(video.height),
    sar,
    // r_frame_rate is the container's nominal grid, e.g. 30000/1001.
    fps: video.r_frame_rate,
    frames: Number(video.nb_read_packets),
    seconds: Number(video.duration ?? parsed.format?.duration) || null,
    codec: video.codec_name,
    alpha: video.tags?.ALPHA_MODE === "1" || video.tags?.alpha_mode === "1",
    audio: audio && { codec: audio.codec_name },
  };
}

/**
 * Generated video drifts from the take: Kling returns 24 fps and up to two
 * frames short. Every source frame takes the edit frame nearest in time, and the
 * last edit frame is held if the edit ends early.
 */
const onSourceGrid = (source) =>
  `setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,` +
  `fps=${source.fps}:round=near,` +
  `scale=${source.width}:${source.height}:flags=bicubic,setsar=1`;

/** A matte with alpha (Bria's transparent VP9) or a grey matte (SwitchX's alpha clip). */
const matteFilter = (source, matte) =>
  `${matte.alpha ? "alphaextract," : "format=gray,"}${onSourceGrid(source)},` +
  // Phase 0's lock softened the matte by about one pixel to hide stair-stepping.
  `gblur=sigma=1,format=gbrp`;

/**
 * One still a tenth of the way in (at most a second), at the source's display
 * aspect with square pixels. A clip shorter than that gives its first frame.
 */
async function poster(out, sourcePath, source) {
  const at = Math.min(1, (source.seconds ?? 0) / 10);
  const width = Math.min(POSTER_WIDTH, source.width);
  const height = Math.max(
    2,
    Math.round((width * source.height) / source.width),
  );
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(at),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height}:flags=bicubic,setsar=1`,
    "-c:v",
    "libwebp",
    "-quality",
    "80",
    "-f",
    "webp",
    out,
  ]);
  return {
    width: source.width,
    height: source.height,
    seconds: source.seconds,
  };
}

export async function render(
  operation,
  out,
  [sourcePath, editPath, mattePath],
) {
  const source = await probe(sourcePath);
  if (!source.frames) throw new Error("The source has no frames");
  if (operation === "poster") return poster(out, sourcePath, source);
  const square = operation === "square";
  const inputs = square
    ? ["-i", sourcePath]
    : ["-i", sourcePath, "-i", editPath];
  // The source's own pixels, resampled to square pixels at its display size.
  const sourcePixels =
    `setpts=PTS-STARTPTS,` +
    `scale=${source.width}:${source.height}:flags=bicubic,setsar=1`;
  let graph = square
    ? `[0:v]${sourcePixels},format=yuv420p[v]`
    : `[1:v]${onSourceGrid(source)}`;
  if (operation === "lock") {
    const matte = await probe(mattePath);
    // ffmpeg's native VP9 decoder drops the alpha plane; libvpx keeps it.
    if (matte.alpha && (matte.codec === "vp9" || matte.codec === "vp8"))
      inputs.push("-c:v", matte.codec === "vp9" ? "libvpx-vp9" : "libvpx");
    inputs.push("-i", mattePath);
    graph +=
      `,format=gbrp[bg];[0:v]${sourcePixels},format=gbrp[fg];` +
      `[2:v]${matteFilter(source, matte)}[m];` +
      `[bg][fg][m]maskedmerge,format=yuv420p[v]`;
  } else if (!square) {
    graph += `,format=yuv420p[v]`;
  }
  const audio = source.audio
    ? [
        "-map",
        "0:a:0",
        ...(source.audio.codec === "aac"
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "256k"]),
      ]
    : [];
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    ...audio,
    "-frames:v",
    String(source.frames),
    "-r",
    source.fps,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ]);
  return {
    fps: source.fps,
    frames: source.frames,
    width: source.width,
    height: source.height,
  };
}

/** Splits the body into the named parts, written to files in `dir`. */
async function readParts(request, dir, names) {
  const header = String(request.headers["x-media-parts"] ?? "");
  const sizes = new Map(
    header.split(",").map((p) => {
      const [name, size] = p.split("=");
      return [name?.trim(), Number(size)];
    }),
  );
  const parts = names.map((name) => {
    const size = sizes.get(name);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PART_BYTES)
      throw new Error(`Missing or invalid size for part "${name}"`);
    return { name, size, path: join(dir, name) };
  });
  let index = 0;
  let file = createWriteStream(parts[0].path);
  let remaining = parts[0].size;
  const done = () =>
    new Promise((resolve, reject) => {
      file.once("error", reject);
      file.end(resolve);
    });
  for await (let chunk of request) {
    while (chunk.length) {
      if (index >= parts.length)
        throw new Error("The body is longer than its parts");
      const take = chunk.subarray(0, remaining);
      if (!file.write(take)) await new Promise((r) => file.once("drain", r));
      remaining -= take.length;
      chunk = chunk.subarray(take.length);
      if (remaining === 0) {
        await done();
        index++;
        if (index < parts.length) {
          file = createWriteStream(parts[index].path);
          remaining = parts[index].size;
        }
      }
    }
  }
  if (index < parts.length)
    throw new Error("The body ended before its last part");
  return parts.map((p) => p.path);
}

async function handle(request, response) {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  const operation = request.url?.slice(1);
  const names = OPERATIONS[operation];
  if (request.method !== "POST" || !names) {
    response.writeHead(404).end("Not found");
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "media-"));
  try {
    const paths = await readParts(request, dir, names);
    const still = operation === "poster";
    const out = join(dir, still ? "out.webp" : "out.mp4");
    const result = await render(operation, out, paths);
    const { size } = await stat(out);
    response.writeHead(200, {
      "content-type": still ? "image/webp" : "video/mp4",
      "content-length": String(size),
      "x-media-width": String(result.width),
      "x-media-height": String(result.height),
      ...(still
        ? result.seconds
          ? { "x-media-duration": String(result.seconds) }
          : {}
        : {
            "x-media-fps": result.fps,
            "x-media-frames": String(result.frames),
          }),
    });
    await pipeline(createReadStream(out), response);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "media_failed",
        operation,
        message: String(error?.message ?? error),
      }),
    );
    if (!response.headersSent)
      response
        .writeHead(422, { "content-type": "text/plain" })
        .end(String(error?.message ?? error).slice(0, 2000));
    else response.destroy();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const [, , command, out, ...paths] = process.argv;
if (command && OPERATIONS[command]) {
  console.log(JSON.stringify(await render(command, out, paths)));
} else {
  createServer((request, response) => void handle(request, response)).listen(
    Number(process.env.PORT ?? 8080),
  );
}
