/**
 * Smart auto-crop. When a photo must be cropped to fill the panel (fill mode),
 * a blind center crop can lop the subject off-frame. Instead we measure where
 * the visual "interest" lives — edge energy, a cheap local saliency proxy — and
 * slide the crop window to keep the busiest region in frame.
 *
 * Everything here is pure, deterministic, and runs entirely on-device: no faces
 * are sent anywhere, no network, no third party. The canvas sampling that feeds
 * these functions lives in imageProcessing.ts (which owns the scratch canvases);
 * this module is just the math, so it is unit-testable without a canvas backend.
 */

/** Pan offset in [-1, 1] per axis (matches EditState.offsetX/offsetY). */
export interface CropOffset {
  offsetX: number;
  offsetY: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Per-pixel edge energy (gradient magnitude on Rec. 601 luma) for a small RGBA
 * buffer composited over white. Forward differences are plenty at the tiny
 * sampling resolution we use, and far cheaper than a full Sobel pass.
 */
export function saliencyEnergy(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; p < luma.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    // Composite over white so transparent regions read as flat (no fake edges),
    // matching how the dither pipeline fills the background.
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    luma[p] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  const energy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const right = x + 1 < w ? luma[p + 1] : luma[p];
      const down = y + 1 < h ? luma[p + w] : luma[p];
      energy[p] = Math.abs(right - luma[p]) + Math.abs(down - luma[p]);
    }
  }
  return energy;
}

/** Sum a 2D energy map down its columns -> a horizontal (per-x) profile. */
export function profileX(energy: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) out[x] += energy[row + x];
  }
  return out;
}

/** Sum a 2D energy map across its rows -> a vertical (per-y) profile. */
export function profileY(energy: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = 0; x < w; x++) s += energy[row + x];
    out[y] = s;
  }
  return out;
}

/**
 * Best normalized center (0..1) for a window covering `visibleFraction` of the
 * axis, maximizing the energy it captures. Ties — including a perfectly flat
 * profile — resolve toward the centered window, so a featureless image keeps the
 * familiar center crop instead of drifting to an edge.
 */
export function bestWindowCenter(profile: Float32Array, visibleFraction: number): number {
  const n = profile.length;
  const f = clamp(visibleFraction, 0, 1);
  if (n === 0 || f >= 1) return 0.5;
  const win = clamp(Math.round(f * n), 1, n);
  const centeredStart = Math.round((n - win) / 2);

  // Sliding-window sum via a running total.
  let sum = 0;
  for (let i = 0; i < win; i++) sum += profile[i];
  let bestSum = sum;
  let bestStart = 0;
  const EPS = 1e-6;
  for (let start = 1; start + win <= n; start++) {
    sum += profile[start + win - 1] - profile[start - 1];
    if (
      sum > bestSum + EPS ||
      (Math.abs(sum - bestSum) <= EPS &&
        Math.abs(start - centeredStart) < Math.abs(bestStart - centeredStart))
    ) {
      bestSum = sum;
      bestStart = start;
    }
  }
  return (bestStart + win / 2) / n;
}

/**
 * Convert a chosen normalized window center to a pan offset in [-1, 1].
 * offset=0 keeps the window centered; offset=+1 reveals the leftmost/topmost
 * part of the source, offset=-1 the rightmost/bottommost (see
 * renderEditedImageData's pan math).
 */
export function offsetForCenter(center: number, visibleFraction: number): number {
  const f = clamp(visibleFraction, 0, 1);
  if (f >= 1) return 0; // nothing croppable on this axis
  return clamp((1 - 2 * center) / (1 - f), -1, 1);
}

/**
 * Pick smart pan offsets for a sampled RGBA buffer. `fractionX`/`fractionY` are
 * the share of the source visible along each axis (displaySize / drawSize); a
 * value >= 1 means that axis isn't cropped, so its offset stays 0.
 */
export function bestCropOffset(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  fractionX: number,
  fractionY: number,
): CropOffset {
  const energy = saliencyEnergy(data, w, h);
  return {
    offsetX: offsetForCenter(bestWindowCenter(profileX(energy, w, h), fractionX), fractionX),
    offsetY: offsetForCenter(bestWindowCenter(profileY(energy, w, h), fractionY), fractionY),
  };
}
