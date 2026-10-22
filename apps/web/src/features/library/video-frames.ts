import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  type InputVideoTrack,
} from "mediabunny";

/**
 * Video work the studio does in the browser with Mediabunny (WebCodecs):
 * measuring a clip, drawing its poster frame, and converting clips with
 * non-square pixels before Kling reads them. Nothing here needs a server or
 * the DOM; it runs in video-frames.worker.ts (see video-frames-client.ts).
 */

export interface VideoFacts {
  /** Display size, corrected for pixel aspect and rotation. */
  width: number;
  height: number;
  durationSeconds: number;
  fps: number | null;
  /** Sample aspect ratio; 1 means square pixels. */
  pixelAspect: number | null;
  hasAudio: boolean;
}

export interface PosterFrame {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number | null;
}

export const POSTER_EDGE = 640;

function open(source: Blob | string) {
  return new Input({
    source:
      typeof source === "string"
        ? // Same-origin media routes; the session cookie rides along.
          new UrlSource(source, { requestInit: { credentials: "same-origin" } })
        : new BlobSource(source),
    formats: ALL_FORMATS,
  });
}

async function primaryVideo(input: Input) {
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error("The file has no video track.");
  return video;
}

async function facts(input: Input, video: InputVideoTrack) {
  const [width, height, durationSeconds, aspect, audio, stats] =
    await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.computeDuration(),
      video.getPixelAspectRatio(),
      input.getAudioTracks(),
      // Frame rate from the frames' own timestamps, not container metadata.
      video.computePacketStats().catch(() => null),
    ]);
  return {
    width,
    height,
    durationSeconds,
    fps: stats?.averagePacketRate || null,
    pixelAspect: aspect.den ? aspect.num / aspect.den : null,
    hasAudio: audio.length > 0,
  } satisfies VideoFacts;
}

export function canvasBlob(canvas: HTMLCanvasElement | OffscreenCanvas) {
  // Feature-tested: there is no HTMLCanvasElement in a worker.
  return "convertToBlob" in canvas
    ? canvas.convertToBlob({ type: "image/webp", quality: 0.82 })
    : new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.82),
      );
}

/** A frame slightly in, which avoids black fade-in frames. */
export const posterTime = (first: number, duration: number) =>
  first + Math.min(1, Math.max(0, duration - first) * 0.1);

async function drawPoster(
  video: InputVideoTrack,
  measured: VideoFacts,
): Promise<PosterFrame | null> {
  if (!(await video.canDecode())) return null;
  const scale = Math.min(
    1,
    POSTER_EDGE / Math.max(measured.width, measured.height),
  );
  const sink = new CanvasSink(video, {
    width: Math.max(1, Math.round(measured.width * scale)),
    height: Math.max(1, Math.round(measured.height * scale)),
    fit: "fill",
    poolSize: 1,
  });
  const first = await video.getFirstTimestamp();
  const frame =
    (await sink.getCanvas(posterTime(first, measured.durationSeconds))) ??
    (await sink.getCanvas(first));
  const blob = frame && (await canvasBlob(frame.canvas));
  return blob
    ? {
        blob,
        width: measured.width,
        height: measured.height,
        durationSeconds: measured.durationSeconds,
      }
    : null;
}

/**
 * Measures a clip and draws its poster. `poster` is null when this browser
 * cannot decode the codec; the measurements come from the container alone.
 */
export async function readVideo(
  source: Blob | string,
): Promise<VideoFacts & { poster: PosterFrame | null }> {
  const input = open(source);
  try {
    const video = await primaryVideo(input);
    const measured = await facts(input, video);
    const poster = await drawPoster(video, measured).catch(() => null);
    return { ...measured, poster };
  } finally {
    input.dispose();
  }
}

/** Why a clip could not be converted to square pixels in this browser. */
export class SquarePixelsError extends Error {}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Resamples a clip with non-square pixels to its display size with square
 * pixels as H.264 MP4, keeping its frames' timing and its audio. Kling refuses
 * non-square pixels with a bare provider error.
 */
export async function convertToSquarePixels(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ file: File; width: number; height: number }> {
  const input = open(file);
  try {
    return await convert(input, file.name, onProgress);
  } finally {
    input.dispose();
  }
}

async function convert(
  input: Input,
  name: string,
  onProgress?: (progress: number) => void,
) {
  const video = await primaryVideo(input);
  const [codedWidth, codedHeight, aspect, rotation] = await Promise.all([
    video.getCodedWidth(),
    video.getCodedHeight(),
    video.getPixelAspectRatio(),
    video.getRotation(),
  ]);
  // Keeps the height and scales the width, as ffmpeg's `scale=iw*sar:ih` does,
  // then rounds to the even sizes H.264 needs.
  const scaled = even((codedWidth * aspect.num) / aspect.den);
  const turned = rotation === 90 || rotation === 270;
  const width = turned ? even(codedHeight) : scaled;
  const height = turned ? scaled : even(codedHeight);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    video: {
      width,
      height,
      fit: "fill",
      codec: "avc",
      quality: QUALITY_HIGH,
      // Rotation is baked into the frames, so the size above is what plays.
      allowTransformationMetadata: false,
      forceTranscode: true,
    },
    // Copied as is when MP4 can carry it, else re-encoded as AAC.
    audio: { codec: "aac" },
    showWarnings: false,
  });
  // Every track is kept or the conversion is not used: losing the audio would
  // break a recast as surely as the pixels.
  const lost = conversion.discardedTracks[0];
  if (!conversion.isValid || lost)
    throw new SquarePixelsError(
      lost?.reason === "undecodable_source_codec"
        ? "This browser cannot decode the clip's video."
        : lost?.reason === "no_encodable_target_codec"
          ? "This browser cannot encode H.264 video."
          : "This clip could not be converted in the browser.",
    );
  if (onProgress) conversion.onProgress = onProgress;
  await conversion.execute();
  const bytes = output.target.buffer;
  if (!bytes) throw new SquarePixelsError("The conversion produced no file.");
  return {
    file: new File([bytes], name.replace(/\.[^.]+$/, "") + ".mp4", {
      type: "video/mp4",
    }),
    width,
    height,
  };
}

/**
 * Cuts `start`–`end` seconds out of a clip as MP4, re-encoded as H.264 so the
 * stretch starts on its first frame, or copied from the keyframe before it
 * when the browser has no H.264 encoder. Audio is kept when there is any. Copy the moves sends only this stretch, so the
 * model reads, and bills, only what the creator chose.
 */
export async function trimClip(
  source: Blob | string,
  start: number,
  end: number,
  name: string,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const input = open(source);
  try {
    // Re-encoded when this browser can, so the stretch starts on its frame;
    // otherwise copied from the keyframe before it, which needs no codec
    // (Chromium without proprietary codecs cannot encode H.264 or AAC).
    for (const exact of [true, false]) {
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });
      const conversion = await Conversion.init({
        input,
        output,
        video: exact
          ? {
              codec: "avc",
              quality: QUALITY_HIGH,
              allowTransformationMetadata: false,
              forceTranscode: true,
            }
          : {},
        audio: exact ? { codec: "aac" } : {},
        trim: { start, end },
        showWarnings: false,
      });
      const lost = conversion.discardedTracks.find(
        (t) => t.track.type === "video",
      );
      if (!conversion.isValid || lost) continue;
      if (onProgress) conversion.onProgress = onProgress;
      await conversion.execute();
      const bytes = output.target.buffer;
      if (!bytes) throw new SquarePixelsError("The cut produced no file.");
      return new File([bytes], name, { type: "video/mp4" });
    }
    throw new SquarePixelsError("This browser cannot cut the clip.");
  } finally {
    input.dispose();
  }
}
