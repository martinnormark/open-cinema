import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Pause,
  Play,
  SplitSquareHorizontal,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { correspondingTime, formatTimecode } from "./model";
import "./revision.css";

type Mode = "wipe" | "side";
type Listen = "source" | "result";
const FRAME = 1 / 25;
const SCRUB_STEPS = 1000;

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Source and result at corresponding moments. The source is the clock; the
 * result follows it with gentle rate correction so playback never stutters.
 * Wipe position, scrub position and timecodes are written to the DOM directly,
 * so dragging and playback never re-render React.
 */
export function CompareViewer({
  sourceUrl,
  resultUrl,
  sourcePoster,
  resultPoster,
  sourceLabel = "Original",
  resultLabel = "Revision",
  aspectRatio = 16 / 9,
  footer,
  onResultLoaded,
}: {
  sourceUrl: string;
  resultUrl: string;
  /** Stills shown until each clip has a frame to paint. */
  sourcePoster?: string | undefined;
  resultPoster?: string | undefined;
  /** Fires once the result's metadata is in, e.g. to start post-run checks. */
  onResultLoaded?: () => void;
  sourceLabel?: string;
  resultLabel?: string;
  aspectRatio?: number;
  footer?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("wipe");
  const [playing, setPlaying] = useState(false);
  const [listen, setListen] = useState<Listen>("source");
  const [durations, setDurations] = useState({ source: 0, result: 0 });

  const source = useRef<FrameVideo | null>(null);
  const result = useRef<FrameVideo | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const wipeWindow = useRef<HTMLDivElement | null>(null);
  const wipeInner = useRef<HTMLDivElement | null>(null);
  const handle = useRef<HTMLDivElement | null>(null);
  const scrubber = useRef<HTMLInputElement | null>(null);
  const sourceClock = useRef<HTMLSpanElement | null>(null);
  const resultClock = useRef<HTMLSpanElement | null>(null);
  const wipe = useRef(0.5);
  const frame = useRef<number | null>(null);
  const drag = useRef<{ left: number; width: number } | null>(null);
  const pendingWipe = useRef<number | null>(null);

  function durationsNow() {
    return {
      source: source.current?.duration || 0,
      result: result.current?.duration || 0,
    };
  }

  function paintWipe() {
    pendingWipe.current = null;
    const p = wipe.current;
    // The result window slides right while its content slides back: both are
    // transforms, so the reveal stays on the compositor.
    if (wipeWindow.current)
      wipeWindow.current.style.transform = `translate3d(${p * 100}%,0,0)`;
    if (wipeInner.current)
      wipeInner.current.style.transform = `translate3d(${-p * 100}%,0,0)`;
    if (handle.current) {
      handle.current.style.transform = `translate3d(${p * 100}%,0,0)`;
      handle.current.setAttribute("aria-valuenow", String(Math.round(p * 100)));
      handle.current.setAttribute(
        "aria-valuetext",
        `${Math.round((1 - p) * 100)}% ${resultLabel.toLowerCase()} visible`,
      );
    }
  }
  function setWipe(p: number) {
    wipe.current = Math.min(1, Math.max(0, p));
    pendingWipe.current ??= requestAnimationFrame(paintWipe);
  }

  function paintClock() {
    const s = source.current;
    const r = result.current;
    if (!s) return;
    const d = durationsNow();
    if (scrubber.current && d.source)
      scrubber.current.value = String(
        Math.round((s.currentTime / d.source) * SCRUB_STEPS),
      );
    if (sourceClock.current)
      sourceClock.current.textContent = formatTimecode(s.currentTime);
    if (resultClock.current && r)
      resultClock.current.textContent = formatTimecode(r.currentTime);
  }

  /** Keeps the result within a frame of the source without visible seeks. */
  function follow() {
    const s = source.current;
    const r = result.current;
    if (!s || !r) return;
    const d = durationsNow();
    const expected = correspondingTime(s.currentTime, d.source, d.result);
    const drift = r.currentTime - expected;
    if (Math.abs(drift) > 0.25) {
      r.currentTime = expected;
      r.playbackRate = s.playbackRate;
    } else if (Math.abs(drift) > FRAME / 2) {
      const ratio = d.source && d.result ? d.result / d.source : 1;
      r.playbackRate = ratio * (drift > 0 ? 0.95 : 1.05);
    } else {
      r.playbackRate = d.source && d.result ? d.result / d.source : 1;
    }
  }

  function tick() {
    paintClock();
    follow();
    const s = source.current;
    if (!s || s.paused) {
      frame.current = null;
      return;
    }
    frame.current = s.requestVideoFrameCallback
      ? s.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }
  function stopTicking() {
    const s = source.current;
    if (frame.current === null) return;
    if (s?.cancelVideoFrameCallback) s.cancelVideoFrameCallback(frame.current);
    else cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  function align() {
    const s = source.current;
    const r = result.current;
    if (!s || !r) return;
    const d = durationsNow();
    r.currentTime = correspondingTime(s.currentTime, d.source, d.result);
    paintClock();
  }

  async function togglePlay() {
    const s = source.current;
    const r = result.current;
    if (!s || !r) return;
    if (s.paused) {
      if (s.ended) s.currentTime = 0;
      align();
      try {
        await Promise.all([s.play(), r.play()]);
      } catch {
        s.pause();
        r.pause();
      }
    } else {
      s.pause();
      r.pause();
      align();
    }
  }

  function seekTo(time: number) {
    const s = source.current;
    if (!s) return;
    const d = durationsNow();
    s.currentTime = Math.min(Math.max(0, time), d.source || time);
    align();
  }
  function step(frames: number) {
    const s = source.current;
    if (!s) return;
    if (!s.paused) {
      s.pause();
      result.current?.pause();
    }
    seekTo(s.currentTime + frames * FRAME);
  }

  function shortcuts(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement && event.key !== " ") return;
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      void togglePlay();
    } else if (event.key === "ArrowLeft" || event.key === ",") {
      event.preventDefault();
      step(event.shiftKey ? -10 : -1);
    } else if (event.key === "ArrowRight" || event.key === ".") {
      event.preventDefault();
      step(event.shiftKey ? 10 : 1);
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "wipe" || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { left: rect.left, width: rect.width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setWipe((event.clientX - rect.left) / rect.width);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const area = drag.current;
    if (!area) return;
    setWipe((event.clientX - area.left) / area.width);
  }
  function endDrag() {
    drag.current = null;
  }

  function changeListen(next: Listen) {
    setListen(next);
    if (source.current) source.current.muted = next !== "source";
    if (result.current) result.current.muted = next !== "result";
  }

  const mismatch =
    durations.source > 0 &&
    durations.result > 0 &&
    Math.abs(durations.source - durations.result) > 0.15;

  const videoClass = "absolute inset-0 size-full object-contain";
  const label =
    "pointer-events-none absolute top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white";

  return (
    <div
      className="compare-viewer outline-none"
      role="group"
      aria-label={`Compare ${sourceLabel.toLowerCase()} and ${resultLabel.toLowerCase()}`}
      onKeyDown={shortcuts}
    >
      <div
        ref={stage}
        className={cn(
          "relative isolate overflow-hidden rounded-xl bg-black",
          mode === "side" && "grid grid-cols-2 gap-px bg-border",
          mode === "wipe" && "cursor-ew-resize touch-none select-none",
        )}
        style={mode === "wipe" ? { aspectRatio } : undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={mode === "side" ? () => void togglePlay() : undefined}
      >
        <div
          className={cn(mode === "side" ? "relative bg-black" : "contents")}
          style={mode === "side" ? { aspectRatio } : undefined}
        >
          <video
            ref={source}
            src={sourceUrl}
            poster={sourcePoster}
            className={videoClass}
            playsInline
            preload="auto"
            muted={listen !== "source"}
            onLoadedMetadata={() => {
              setDurations(durationsNow());
              paintClock();
            }}
            onPlay={() => {
              setPlaying(true);
              if (frame.current === null) tick();
            }}
            onPause={() => {
              setPlaying(false);
              stopTicking();
              paintClock();
            }}
            onEnded={() => result.current?.pause()}
            onSeeked={paintClock}
          />
          {mode === "side" && (
            <span className={cn(label, "left-3")}>{sourceLabel}</span>
          )}
        </div>
        <div
          ref={wipeWindow}
          className={cn(
            mode === "side"
              ? "relative bg-black"
              : "compare-layer absolute inset-0 overflow-hidden",
          )}
          style={
            mode === "side"
              ? { aspectRatio }
              : { transform: `translate3d(${wipe.current * 100}%,0,0)` }
          }
        >
          <div
            ref={wipeInner}
            className={cn(
              mode === "side" ? "contents" : "compare-layer absolute inset-0",
            )}
            style={
              mode === "wipe"
                ? { transform: `translate3d(${-wipe.current * 100}%,0,0)` }
                : undefined
            }
          >
            <video
              ref={result}
              src={resultUrl}
              poster={resultPoster}
              className={videoClass}
              playsInline
              preload="auto"
              muted={listen !== "result"}
              onLoadedMetadata={() => {
                setDurations(durationsNow());
                align();
                // A swapped result (another variant) rejoins playback in place.
                if (source.current && !source.current.paused)
                  void result.current?.play().catch(() => undefined);
                onResultLoaded?.();
              }}
            />
          </div>
          {mode === "side" && (
            <span className={cn(label, "left-3")}>{resultLabel}</span>
          )}
        </div>
        {mode === "wipe" && (
          <>
            <span className={cn(label, "left-3")}>{sourceLabel}</span>
            <span className={cn(label, "right-3")}>{resultLabel}</span>
            <div
              ref={handle}
              role="slider"
              tabIndex={0}
              aria-label="Wipe position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(wipe.current * 100)}
              className="compare-layer pointer-events-none absolute inset-0 outline-none [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-ring"
              style={{ transform: `translate3d(${wipe.current * 100}%,0,0)` }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  event.stopPropagation();
                  setWipe(
                    wipe.current +
                      (event.key === "ArrowLeft" ? -0.05 : 0.05) *
                        (event.shiftKey ? 2 : 1),
                  );
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  event.stopPropagation();
                  setWipe(event.key === "Home" ? 0 : 1);
                }
              }}
            >
              <span className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]" />
              <span className="pointer-events-auto absolute top-1/2 left-0 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-[0_2px_10px_rgb(0_0_0/0.45)]">
                <SplitSquareHorizontal aria-hidden="true" className="size-4" />
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void togglePlay()}
          aria-label={playing ? "Pause both" : "Play both"}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <div className="flex items-center">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => step(-1)}
            aria-label="Previous frame"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => step(1)}
            aria-label="Next frame"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <input
          ref={scrubber}
          type="range"
          min={0}
          max={SCRUB_STEPS}
          defaultValue={0}
          aria-label="Scrub both clips"
          className="compare-scrubber min-w-40 flex-1"
          onChange={(event) =>
            seekTo(
              (Number(event.target.value) / SCRUB_STEPS) *
                (durationsNow().source || 0),
            )
          }
        />
        <p className="tabular flex items-center gap-1.5 text-xs text-muted-foreground">
          <span ref={sourceClock}>0:00.00</span>
          <span aria-hidden="true">·</span>
          <span ref={resultClock}>0:00.00</span>
          <span className="sr-only">original and revision timecodes</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Comparison layout"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "wipe",
              label: "Wipe",
              icon: <SplitSquareHorizontal aria-hidden="true" />,
            },
            {
              value: "side",
              label: "Side by side",
              icon: <Columns2 aria-hidden="true" />,
            },
          ]}
        />
        <Segmented
          label="Audio"
          value={listen}
          onChange={changeListen}
          options={[
            {
              value: "source",
              label: sourceLabel,
              icon: <Volume2 aria-hidden="true" />,
            },
            { value: "result", label: resultLabel },
          ]}
        />
      </div>
      {mismatch && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          The revision runs{" "}
          <span className="tabular">{formatTimecode(durations.result)}</span>{" "}
          against the original’s{" "}
          <span className="tabular">{formatTimecode(durations.source)}</span>.
          Scrubbing compares the same point in each take.
        </p>
      )}
      {footer}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="segmented relative inline-flex rounded-lg bg-secondary p-0.5"
      ref={followResize}
    >
      <span className="segmented-pill" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          // The checked option moves the pill; callback refs rerun each render.
          ref={value === option.value ? placePill : undefined}
          onClick={() => onChange(option.value)}
          className="relative z-[1] inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:text-foreground [&_svg]:size-3.5"
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Sliding selection (transitions.dev tabs sliding): the pill takes the
 * checked option's box. The first placement snaps; later ones glide.
 */
function placePill(option: HTMLButtonElement | null) {
  const pill =
    option?.parentElement?.querySelector<HTMLElement>(".segmented-pill");
  if (!option || !pill) return;
  const first = !pill.dataset.placed;
  if (first) pill.style.transition = "none";
  pill.style.width = `${option.offsetWidth}px`;
  pill.style.transform = `translateX(${option.offsetLeft}px)`;
  if (first) {
    void pill.offsetWidth;
    pill.style.transition = "";
    pill.dataset.placed = "true";
  }
}
/** Labels can change width when the font loads or the layout reflows. */
function followResize(group: HTMLDivElement | null) {
  if (!group || typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(() => {
    const pill = group.querySelector<HTMLElement>(".segmented-pill");
    if (pill) delete pill.dataset.placed;
    placePill(group.querySelector('[aria-checked="true"]'));
  });
  observer.observe(group);
  return () => observer.disconnect();
}
