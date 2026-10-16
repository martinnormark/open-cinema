"use client";
import { useCallback, useState, type CSSProperties } from "react";
import {
  createOrbRenderer,
  type OrbDrive,
  type OrbState,
  type OrbVariant,
} from "./renderer";
export type { OrbVariant } from "./renderer";
export interface ShaderOrbProps {
  variant: OrbVariant;
  state?: OrbState;
  size?: number;
  paused?: boolean;
  maxDpr?: number;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}
/** Callback-ref owns GPU resources; the DOM dataset updates the renderer without rebuilding it. */
export function ShaderOrb({
  variant,
  state = "idle",
  size = 64,
  paused = false,
  maxDpr = 1.5,
  className,
  style,
  ariaLabel,
}: ShaderOrbProps) {
  const [painted, setPainted] = useState(false);
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      setPainted(false);
      const drive = (): OrbDrive => ({
        state: canvas.dataset.state === "thinking" ? "thinking" : "idle",
        paused: canvas.dataset.paused === "true",
      });
      const renderer = createOrbRenderer({
        canvas,
        variant,
        drive,
        maxDpr,
        pauseOffscreen: true,
        onFirstFrame: () => setPainted(true),
      });
      void renderer.ready.catch(() => {
        /* Keep the accessible static fallback when WebGPU is unavailable. */
      });
      return renderer.dispose;
    },
    [variant, maxDpr],
  );
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        position: "relative",
        ...style,
      }}
    >
      {!painted && <span aria-hidden="true" className="orb-fallback" />}
      <canvas
        ref={attach}
        data-state={state}
        data-paused={paused}
        aria-label={ariaLabel}
        style={{ width: "100%", height: "100%", opacity: painted ? 1 : 0 }}
      />
    </span>
  );
}
