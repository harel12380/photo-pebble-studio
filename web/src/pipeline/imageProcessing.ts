import type { RGB } from '../cardFormat';
import type { EditState } from '../types';
import { bestCropOffset, type CropOffset } from './smartCrop';
import { applyWhiteBalance } from './whiteBalance';

/**
 * Main-thread image work: decode source blobs and render the non-destructive
 * edit (rotate + crop/pan/zoom + brightness/contrast/saturation + background)
 * onto a canvas. The expensive per-pixel dithering happens in the Web Worker.
 *
 * Two render entry points:
 *  - renderEditedImageData: a panel-sized window WITH the current pan applied
 *    (used for the live source preview and for dithering non-selected photos).
 *  - renderFrameImageData: the WHOLE pannable area (panel-sized or larger),
 *    centered, no pan. Dithering this once lets panning be a cheap crop of the
 *    already-dithered result (see cropIndicesWindow) instead of re-dithering.
 */

/* ----------------------------- bitmap cache ----------------------------- */

// Decoded bitmaps are large (a 12MP photo is ~48MB decoded, a 48MP phone shot
// ~190MB). Keep only a few, closing evicted ones so memory is actually
// released. The currently-displayed photo is "pinned" so it is never closed
// out from under the editor.
const MAX_BITMAPS = 4;
const bitmapCache = new Map<Blob, Promise<ImageBitmap>>();
const pinned = new Set<Blob>();

// The panel's long side is 600px and zoom maxes out at 4×, so the pipeline never
// draws the source larger than ~2400px on its long side. Decoding at the photo's
// full native resolution wastes enormous amounts of RAM (a single 48MP image is
// ~190MB) for detail that can never be displayed. Capping the decoded bitmap to
// what the pipeline can actually use is lossless and the biggest memory win in
// the app. 2560 leaves a little headroom above the 2400px theoretical max.
const MAX_DECODE_DIM = 2560;

/**
 * Decode a blob to a bitmap, downscaling so its long side is at most
 * MAX_DECODE_DIM. Smaller sources are returned untouched (never upscaled).
 */
async function decodeCapped(blob: Blob): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const longest = Math.max(full.width, full.height);
  if (longest <= MAX_DECODE_DIM) return full;

  const scale = MAX_DECODE_DIM / longest;
  const w = Math.max(1, Math.round(full.width * scale));
  const h = Math.max(1, Math.round(full.height * scale));
  try {
    const small = await createImageBitmap(full, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: 'high',
    });
    full.close(); // release the full-res buffer immediately
    return small;
  } catch {
    return full; // resize options unsupported — keep the full bitmap
  }
}

/** Protect a blob's decoded bitmap from eviction (the photo being edited). */
export function pinBlob(blob: Blob): void {
  pinned.add(blob);
}
export function unpinBlob(blob: Blob): void {
  pinned.delete(blob);
}

function evict(): void {
  while (bitmapCache.size > MAX_BITMAPS) {
    let removed = false;
    for (const key of bitmapCache.keys()) {
      if (pinned.has(key)) continue;
      const p = bitmapCache.get(key);
      bitmapCache.delete(key);
      void p?.then((b) => b.close()).catch(() => {});
      removed = true;
      break;
    }
    if (!removed) break; // everything left is pinned
  }
}

export function decodeBlob(blob: Blob): Promise<ImageBitmap> {
  const existing = bitmapCache.get(blob);
  if (existing) {
    bitmapCache.delete(blob);
    bitmapCache.set(blob, existing); // refresh LRU position
    return existing;
  }
  const p = decodeCapped(blob);
  bitmapCache.set(blob, p);
  evict();
  return p;
}

/* ----------------------------- scratch canvases ----------------------------- */

function makeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}
let panelCanvas: HTMLCanvasElement | null = null;
let frameCanvas: HTMLCanvasElement | null = null;

function sizedCanvas(
  which: 'panel' | 'frame',
  w: number,
  h: number,
): HTMLCanvasElement {
  let c = which === 'panel' ? panelCanvas : frameCanvas;
  if (!c) {
    c = makeCanvas();
    if (which === 'panel') panelCanvas = c;
    else frameCanvas = c;
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

/* ----------------------------- analysis ----------------------------- */

// Histograms only need a coarse picture of the tonal distribution, so sample a
// tiny downscaled copy: 128px on the long side is ~16k pixels — plenty for
// stable percentiles, cheap to draw and read back.
const HIST_SAMPLE_DIM = 128;
let histCanvas: HTMLCanvasElement | null = null;

/**
 * Sample a 256-bin luminance histogram (Rec. 601 luma) from a bitmap, drawn at
 * reduced size. Transparency is composited over white to match the dither
 * pipeline. Used by the content-aware auto-enhance (see autoTone.ts).
 */
export function lumaHistogram(bitmap: ImageBitmap): Uint32Array {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, HIST_SAMPLE_DIM / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  if (!histCanvas) histCanvas = makeCanvas();
  histCanvas.width = w;
  histCanvas.height = h;
  const ctx = ctx2d(histCanvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[y | 0]++;
  }
  return hist;
}

/**
 * Mean R/G/B of a bitmap (drawn at reduced size, transparency composited over
 * white to match the dither pipeline). Feeds the gray-world auto white balance
 * (see whiteBalance.ts / autoEnhance). Reuses the histogram scratch canvas.
 */
export function averageColor(bitmap: ImageBitmap): RGB {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, HIST_SAMPLE_DIM / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  if (!histCanvas) histCanvas = makeCanvas();
  histCanvas.width = w;
  histCanvas.height = h;
  const ctx = ctx2d(histCanvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [r / n, g / n, b / n];
}

// Smart-crop saliency only needs a coarse map of where detail lives, so sample
// a tiny copy — 96px on the long side is ~9k pixels, stable yet cheap.
const SMARTCROP_SAMPLE_DIM = 96;
let smartCropCanvas: HTMLCanvasElement | null = null;

/**
 * Choose smart default pan offsets that keep the busiest region of a photo in
 * frame instead of a blind center crop (see smartCrop.ts). Returns null when
 * the photo isn't actually cropped (fit mode / no pan room) or while rotated —
 * the caller only runs this on freshly imported, unrotated photos. Fully local:
 * the bitmap never leaves the device.
 */
export function smartCropOffset(
  bitmap: ImageBitmap,
  edit: EditState,
  displayWidth: number,
  displayHeight: number,
): CropOffset | null {
  if (edit.rotation !== 0) return null;
  const geo = computeDrawGeometry(bitmap.width, bitmap.height, edit, displayWidth, displayHeight);
  if (geo.panRangeX <= 0 && geo.panRangeY <= 0) return null;

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, SMARTCROP_SAMPLE_DIM / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  if (!smartCropCanvas) smartCropCanvas = makeCanvas();
  smartCropCanvas.width = w;
  smartCropCanvas.height = h;
  const ctx = ctx2d(smartCropCanvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const fractionX = displayWidth / geo.drawW;
  const fractionY = displayHeight / geo.drawH;
  return bestCropOffset(data, w, h, fractionX, fractionY);
}

/* ----------------------------- geometry ----------------------------- */

export interface DrawGeometry {
  drawW: number;
  drawH: number;
  panRangeX: number;
  panRangeY: number;
  scale: number;
}

/** Geometry of the photo drawn into a panel-sized frame at the current zoom. */
export function computeDrawGeometry(
  bitmapWidth: number,
  bitmapHeight: number,
  edit: EditState,
  displayWidth: number,
  displayHeight: number,
): DrawGeometry {
  const swap = edit.rotation === 90 || edit.rotation === 270;
  const iw = swap ? bitmapHeight : bitmapWidth;
  const ih = swap ? bitmapWidth : bitmapHeight;
  const cover = Math.max(displayWidth / iw, displayHeight / ih);
  const contain = Math.min(displayWidth / iw, displayHeight / ih);
  const base = edit.cropMode === 'fill' ? cover : contain;
  const scale = base * edit.zoom;
  const drawW = iw * scale;
  const drawH = ih * scale;
  return {
    drawW,
    drawH,
    panRangeX: Math.max(0, (drawW - displayWidth) / 2),
    panRangeY: Math.max(0, (drawH - displayHeight) / 2),
    scale,
  };
}

/* ----------------------------- painting ----------------------------- */

function buildFilter(edit: EditState): string {
  const b = 1 + edit.brightness / 100;
  const c = 1 + edit.contrast / 100;
  const s = 1 + edit.saturation / 100;
  if (b === 1 && c === 1 && s === 1) return 'none';
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function cssRgb([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  edit: EditState,
  w: number,
  h: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const isFit = edit.cropMode === 'fit';
  const baseColor: RGB =
    isFit && edit.background.type === 'color' ? edit.background.color : [255, 255, 255];
  ctx.fillStyle = cssRgb(baseColor);
  ctx.fillRect(0, 0, w, h);

  if (isFit && edit.background.type === 'blur') {
    const swap = edit.rotation === 90 || edit.rotation === 270;
    const iw = swap ? bitmap.height : bitmap.width;
    const ih = swap ? bitmap.width : bitmap.height;
    // Cover the frame, slightly over-zoomed so the blurred edges don't show.
    const cover = Math.max(w / iw, h / ih) * 1.15;
    const bw = bitmap.width * cover;
    const bh = bitmap.height * cover;
    ctx.save();
    ctx.filter = `blur(${Math.round(Math.max(w, h) * 0.045)}px) brightness(0.82)`;
    ctx.translate(w / 2, h / 2);
    ctx.rotate((edit.rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
    ctx.filter = 'none';
  }
}

function paintForeground(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  edit: EditState,
  scale: number,
  centerX: number,
  centerY: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = buildFilter(edit);
  ctx.translate(centerX, centerY);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  const bdw = bitmap.width * scale;
  const bdh = bitmap.height * scale;
  ctx.drawImage(bitmap, -bdw / 2, -bdh / 2, bdw, bdh);
  ctx.restore();
  ctx.filter = 'none';
}

/** Render a panel-sized window with the current pan applied. */
export function renderEditedImageData(
  bitmap: ImageBitmap,
  edit: EditState,
  displayWidth: number,
  displayHeight: number,
): ImageData {
  const canvas = sizedCanvas('panel', displayWidth, displayHeight);
  const ctx = ctx2d(canvas);
  paintBackground(ctx, bitmap, edit, displayWidth, displayHeight);
  const geo = computeDrawGeometry(
    bitmap.width,
    bitmap.height,
    edit,
    displayWidth,
    displayHeight,
  );
  const panX = clamp(edit.offsetX, -1, 1) * geo.panRangeX;
  const panY = clamp(edit.offsetY, -1, 1) * geo.panRangeY;
  paintForeground(
    ctx,
    bitmap,
    edit,
    geo.scale,
    displayWidth / 2 + panX,
    displayHeight / 2 + panY,
  );
  const out = ctx.getImageData(0, 0, displayWidth, displayHeight);
  applyWhiteBalance(out.data, edit);
  return out;
}

export interface FrameRender {
  data: ImageData;
  frameW: number;
  frameH: number;
}

/** Render the whole pannable area (centered, no pan) for dither-once panning. */
export function renderFrameImageData(
  bitmap: ImageBitmap,
  edit: EditState,
  displayWidth: number,
  displayHeight: number,
): FrameRender {
  const geo = computeDrawGeometry(
    bitmap.width,
    bitmap.height,
    edit,
    displayWidth,
    displayHeight,
  );
  const frameW = Math.max(displayWidth, Math.round(geo.drawW));
  const frameH = Math.max(displayHeight, Math.round(geo.drawH));
  const canvas = sizedCanvas('frame', frameW, frameH);
  const ctx = ctx2d(canvas);
  paintBackground(ctx, bitmap, edit, frameW, frameH);
  paintForeground(ctx, bitmap, edit, geo.scale, frameW / 2, frameH / 2);
  const data = ctx.getImageData(0, 0, frameW, frameH);
  applyWhiteBalance(data.data, edit);
  return { data, frameW, frameH };
}

/** Crop a panel-sized window of palette indices out of a dithered frame. */
export function cropIndicesWindow(
  frame: Uint8Array,
  frameW: number,
  frameH: number,
  panelW: number,
  panelH: number,
  offsetX: number,
  offsetY: number,
): Uint8Array {
  const out = new Uint8Array(panelW * panelH);
  const panRangeX = (frameW - panelW) / 2;
  const panRangeY = (frameH - panelH) / 2;
  let x0 = Math.round(panRangeX - clamp(offsetX, -1, 1) * panRangeX);
  let y0 = Math.round(panRangeY - clamp(offsetY, -1, 1) * panRangeY);
  x0 = Math.max(0, Math.min(frameW - panelW, x0));
  y0 = Math.max(0, Math.min(frameH - panelH, y0));
  for (let y = 0; y < panelH; y++) {
    const src = (y0 + y) * frameW + x0;
    out.set(frame.subarray(src, src + panelW), y * panelW);
  }
  return out;
}

/** Convert palette indices back to RGBA pixels for on-screen preview. */
export function indicesToImageData(
  indices: Uint8Array,
  palette: readonly RGB[],
  width: number,
  height: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const [r, g, b] = palette[indices[i]] ?? [0, 0, 0];
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
