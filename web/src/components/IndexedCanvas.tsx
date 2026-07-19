import { createEffect, type Component } from "solid-js";
import { PALETTE_RGB, PREVIEW_RGB } from "../cardFormat";
import type { DitherResult } from "../types";
import { indicesToImageData } from "../pipeline/imageProcessing";
import { state } from "../state/store";

/**
 * Renders a dithered result (palette indices) onto a <canvas>. The palette is
 * chosen by the global `previewColors` view setting: "vivid" uses the true sRGB
 * palette so the dither reads like the original photo, "panel" uses the honest,
 * muted on-panel colors that simulate the e-ink display. When `maxSize` is set
 * (list thumbnails) the backing store is downscaled so a long photo list doesn't
 * keep dozens of full-resolution canvases alive.
 *
 * One shared scratch canvas is reused for the downscale step: createEffect runs
 * synchronously on the main thread, so a single canvas avoids per-thumbnail
 * allocation churn.
 */
let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return scratch;
}

export const IndexedCanvas: Component<{
  result: DitherResult;
  class?: string;
  maxSize?: number;
  /** Accessible description of the rendered preview. */
  alt?: string;
}> = (props) => {
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    const result = props.result;
    const maxSize = props.maxSize;
    if (!canvas) return;
    const palette = state.previewColors === "panel" ? PREVIEW_RGB : PALETTE_RGB;
    const img = indicesToImageData(result.indices, palette, result.width, result.height);

    if (maxSize && Math.max(result.width, result.height) > maxSize) {
      const scale = maxSize / Math.max(result.width, result.height);
      const tw = Math.max(1, Math.round(result.width * scale));
      const th = Math.max(1, Math.round(result.height * scale));
      const tmp = scratchCanvas(result.width, result.height);
      tmp.getContext("2d")?.putImageData(img, 0, 0);
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(tmp, 0, 0, tw, th);
      }
    } else {
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext("2d")?.putImageData(img, 0, 0);
    }
  });

  return (
    <canvas
      ref={canvas}
      class={`pixelated ${props.class ?? ""}`}
      role={props.alt ? "img" : undefined}
      aria-label={props.alt}
    />
  );
};
