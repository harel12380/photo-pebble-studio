/**
 * Render a MessageSpec to panel-resolution pixels. The output is a PNG blob that
 * flows through the exact same edit + dither + export pipeline as a photo, so a
 * message becomes just another frame on the card.
 *
 * Layouts:
 *   - card:    a solid background with wrapped text.
 *   - band:    a photo fills most of the frame; a solid text band sits on the
 *              top or bottom edge.
 *   - overlay: text drawn over the photo, with an optional darkening scrim.
 *
 * The placement math lives in ./layout (pure, unit-tested); this module only
 * talks to the canvas.
 */
import { paletteColor, type MessageSpec, type PaletteColorId } from "../types";
import { ensureFont, fontCss } from "../fonts";
import {
  anchorX,
  bandGeometry,
  blockTop,
  coverRect,
  lineCenters,
  overlayScrimRect,
  overlayVAlign,
  resolveAlign,
  wrapText,
  type Rect,
} from "./layout";

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOpts {
  width: number;
  height: number;
  /** Required for "band" and "overlay" layouts; ignored for "card". */
  baseImage?: ImageBitmap | null;
}

function rgbCss(id: PaletteColorId): string {
  const [r, g, b] = paletteColor(id).rgb;
  return `rgb(${r}, ${g}, ${b})`;
}

function drawImageCover(ctx: AnyCtx, img: ImageBitmap, dest: Rect): void {
  const { dx, dy, dw, dh } = coverRect(img.width, img.height, dest);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dest.x, dest.y, dest.w, dest.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Draw the text of a spec into a rectangular area of the canvas. */
function drawTextInArea(
  ctx: AnyCtx,
  spec: MessageSpec,
  area: Rect,
  fontPx: number,
  pad: number,
  vAlign = spec.vAlign,
): void {
  ctx.fillStyle = rgbCss(spec.textColor);
  ctx.font = fontCss(spec.fontId, spec.fontWeight, fontPx);
  ctx.textBaseline = "middle";
  (ctx as CanvasRenderingContext2D).direction = spec.direction;

  const resolved = resolveAlign(spec.align, spec.direction);
  ctx.textAlign = resolved;

  const maxWidth = Math.max(0, area.w - pad * 2);
  const lines = wrapText(spec.text, maxWidth, (s) => ctx.measureText(s).width);
  const lineH = fontPx * spec.lineSpacing;
  const blockH = lineH * lines.length;
  const top = blockTop(vAlign, area.y, area.h, blockH);
  const ys = lineCenters(top, lineH, lines.length);
  const x = anchorX(resolved, area.x, area.x + area.w, pad);

  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, ys[i]);
}

/** Core draw routine, shared by the blob renderer and the live preview. */
export function drawMessage(
  ctx: AnyCtx,
  spec: MessageSpec,
  width: number,
  height: number,
  baseImage?: ImageBitmap | null,
): void {
  const short = Math.min(width, height);
  const fontPx = Math.max(1, spec.fontScale * short);
  const pad = spec.paddingPct * short;
  const frame: Rect = { x: 0, y: 0, w: width, h: height };

  if (spec.layout === "band") {
    const { band, image } = bandGeometry(
      spec.band?.edge ?? "bottom",
      spec.band?.sizePct ?? 0.25,
      width,
      height,
    );
    if (baseImage) drawImageCover(ctx, baseImage, image);
    else {
      ctx.fillStyle = "rgb(208,210,210)"; // neutral when no photo chosen yet
      ctx.fillRect(image.x, image.y, image.w, image.h);
    }
    ctx.fillStyle = rgbCss(spec.backgroundColor);
    ctx.fillRect(band.x, band.y, band.w, band.h);
    drawTextInArea(ctx, spec, band, fontPx, pad, "middle");
    return;
  }

  if (spec.layout === "overlay") {
    if (baseImage) drawImageCover(ctx, baseImage, frame);
    else {
      ctx.fillStyle = rgbCss(spec.backgroundColor);
      ctx.fillRect(0, 0, width, height);
    }
    const position = spec.overlay?.position ?? "bottom";
    if (spec.overlay?.scrim) {
      // Size the scrim to the *wrapped* line count, not just explicit newlines.
      // Counting only "\n" under-sizes the scrim for any message that word-wraps
      // (the common case for a sentence with no manual breaks), so the extra
      // lines spill past the darkening band onto the bare photo and lose all
      // contrast. Wrap with the same font + width the text draw uses so the band
      // always covers every line. ctx.font/direction must match drawTextInArea.
      ctx.font = fontCss(spec.fontId, spec.fontWeight, fontPx);
      (ctx as CanvasRenderingContext2D).direction = spec.direction;
      const lineH = fontPx * spec.lineSpacing;
      const maxWidth = Math.max(0, width - pad * 2);
      const lineCount = Math.max(
        1,
        wrapText(spec.text, maxWidth, (s) => ctx.measureText(s).width).length,
      );
      const scrim = overlayScrimRect(position, width, height, lineH * lineCount, pad);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(scrim.x, scrim.y, scrim.w, scrim.h);
      ctx.restore();
    }
    drawTextInArea(ctx, spec, frame, fontPx, pad, overlayVAlign(position));
    return;
  }

  // card
  ctx.fillStyle = rgbCss(spec.backgroundColor);
  ctx.fillRect(0, 0, width, height);
  drawTextInArea(ctx, spec, frame, fontPx, pad);
}

function makeCanvas(width: number, height: number): {
  ctx: AnyCtx;
  toBlob: () => Promise<Blob>;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
    return { ctx, toBlob: () => c.convertToBlob({ type: "image/png" }) };
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  return {
    ctx,
    toBlob: () =>
      new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas render failed"))), "image/png"),
      ),
  };
}

/** Render a message to a PNG blob at the given panel resolution. */
export async function renderMessage(spec: MessageSpec, opts: RenderOpts): Promise<Blob> {
  const { width, height, baseImage } = opts;
  const short = Math.min(width, height);
  await ensureFont(spec.fontId, spec.fontWeight, spec.fontScale * short);
  const { ctx, toBlob } = makeCanvas(width, height);
  drawMessage(ctx, spec, width, height, baseImage);
  return toBlob();
}
