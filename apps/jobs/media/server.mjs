// Media container for the jobs Worker: ffmpeg steps that no Router model offers.
//
//   POST /lock     parts source, edit, matte -> the source foreground over the edit
//   POST /conform  parts source, edit        -> the edit on the source's frame grid
//
// Both return an MP4 on the source's exact frame rate and frame count, carrying
// the source's audio. The request body is the parts concatenated in the order
// the `x-media-parts` header lists them (`source=123,edit=456`), so the Worker
// can stream R2 objects in without buffering.
//
// Offline: node server.mjs lock|conform <out.mp4> <source> <edit> [matte]
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
};
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
    "-of",
    "json",
    path,
  ]);
  const streams = JSON.parse(out).streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${path} has no video stream`);
  const audio = streams.find((s) => s.codec_type === "audio") ?? null;
  return {
    width: video.width,
    height: video.height,
    // r_frame_rate is the container's nominal grid, e.g. 30000/1001.
    fps: video.r_frame_rate,
    frames: Number(video.nb_read_packets),
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

export async function render(
  operation,
  out,
  [sourcePath, editPath, mattePath],
) {
  const source = await probe(sourcePath);
  if (!source.frames) throw new Error("The source has no frames");
  const inputs = ["-i", sourcePath, "-i", editPath];
  let graph = `[1:v]${onSourceGrid(source)}`;
  if (operation === "lock") {
    const matte = await probe(mattePath);
    // ffmpeg's native VP9 decoder drops the alpha plane; libvpx keeps it.
    if (matte.alpha && (matte.codec === "vp9" || matte.codec === "vp8"))
      inputs.push("-c:v", matte.codec === "vp9" ? "libvpx-vp9" : "libvpx");
    inputs.push("-i", mattePath);
    graph +=
      `,format=gbrp[bg];[0:v]setpts=PTS-STARTPTS,setsar=1,format=gbrp[fg];` +
      `[2:v]${matteFilter(source, matte)}[m];` +
      `[bg][fg][m]maskedmerge,format=yuv420p[v]`;
  } else {
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
  return { fps: source.fps, frames: source.frames };
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
    const out = join(dir, "out.mp4");
    const result = await render(operation, out, paths);
    const { size } = await stat(out);
    response.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": String(size),
      "x-media-fps": result.fps,
      "x-media-frames": String(result.frames),
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
