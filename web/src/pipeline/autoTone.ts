/**
 * Content-aware auto-tone: turn a luminance histogram into brightness/contrast
 * adjustments (an "auto-levels" stretch), expressed in the studio's -100..100
 * edit model.
 *
 * The edit model applies adjustments as CSS canvas filters, in order
 * `brightness(b) contrast(c)` where b = 1 + brightness/100 and c = 1 + contrast/100
 * (see buildFilter in imageProcessing.ts). For a pixel value x in [0,1] that is:
 *
 *   x1 = x * b                         (brightness, multiplicative)
 *   x2 = (x1 - 0.5) * c + 0.5          (contrast, around mid-gray)
 *
 * We want to stretch the histogram so its low/high percentiles map to (near)
 * black and white: x2 ≈ (x - lo) / (hi - lo). Matching the affine form
 * x2 = b·c·x + 0.5(1 - c) gives a closed form for b and c — no iteration,
 * fully deterministic, runs in the browser with no network. Pure and unit-tested
 * here; the DOM histogram sampling lives in imageProcessing.ts.
 */

/** Percentiles used as the black/white anchors. Slightly inset from 0/100 so a
 *  handful of stray dark/bright pixels don't dictate the whole stretch. */
const LO_PERCENTILE = 0.005;
const HI_PERCENTILE = 0.995;

/** Below this tonal spread the image is essentially flat (a solid color, a
 *  scan of text); stretching it would explode contrast, so fall back to the
 *  gentle e-ink lift instead. */
const MIN_SPREAD = 0.04;

/** Gentle default lift for flat/degenerate images — matches the panel-friendly
 *  baseline new photos already start with. */
const FLAT_FALLBACK = { brightness: 8, contrast: 20 } as const;

/** A dim e-ink panel reads better with at least a little contrast, so floor the
 *  computed contrast here even when the source is already well-exposed. We do
 *  NOT floor brightness — lifting an already-bright image only clips highlights. */
const MIN_CONTRAST = 8;

function clampPct(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

/** Value at percentile `p` (0..1) of a 256-bin histogram, returned as 0..255. */
function percentile(hist: ArrayLike<number>, total: number, p: number): number {
  const target = p * total;
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= target) return v;
  }
  return 255;
}

export interface AutoTone {
  brightness: number;
  contrast: number;
}

/**
 * Derive brightness/contrast (each -100..100) from a 256-bin luminance
 * histogram. Returns a gentle fixed lift for empty or near-flat histograms.
 */
export function autoToneFromHistogram(hist: ArrayLike<number>): AutoTone {
  let total = 0;
  for (let v = 0; v < 256; v++) total += hist[v];
  if (total === 0) return { ...FLAT_FALLBACK };

  const lo = percentile(hist, total, LO_PERCENTILE) / 255;
  const hi = percentile(hist, total, HI_PERCENTILE) / 255;
  const spread = hi - lo;
  if (spread < MIN_SPREAD) return { ...FLAT_FALLBACK };

  // c = 1 + 2·lo/spread, b = 1 / (spread·c) — see module header.
  const c = 1 + (2 * lo) / spread;
  const b = 1 / (spread * c);

  return {
    brightness: clampPct((b - 1) * 100),
    contrast: clampPct(Math.max((c - 1) * 100, MIN_CONTRAST)),
  };
}
