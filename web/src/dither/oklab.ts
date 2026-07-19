/**
 * Shared color math for the dithering engine.
 *
 * Everything matches in OKLab, a perceptually-uniform space. With a tiny, very
 * saturated 6-color palette the critical failure is neutral/muted tones (gray,
 * dirt, skin, foliage) snapping to a saturated primary — e.g. mid-gray's nearest
 * *RGB* color is blue, brown's is green — which sprays rainbow speckle. Matching
 * in OKLab with the chroma channels scaled up (`chromaWeight`) makes neutrals
 * correctly prefer black/white, killing the rainbow noise. A higher chroma
 * weight also makes the limited palette hold onto color instead of desaturating.
 */

export type Lab = readonly [number, number, number];

// sRGB byte -> linear, precomputed (inputs are 0-255). Fractional values from
// alpha compositing are rounded to the nearest entry — negligible error.
export const LIN_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const x = i / 255;
  LIN_LUT[i] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** sRGB byte (0-255) -> linear 0..1, via the LUT. */
export function lin(c: number): number {
  const i = c <= 0 ? 0 : c >= 255 ? 255 : c | 0;
  return LIN_LUT[i];
}

/** Linear 0..1 -> sRGB byte 0..255. */
export function linToSrgbByte(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** Linear-RGB triple -> OKLab with chroma (a,b) pre-scaled by `chromaWeight`. */
export function linToLab(
  lr: number,
  lg: number,
  lb: number,
  chromaWeight: number,
): Lab {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * chromaWeight,
    (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * chromaWeight,
  ];
}

/** sRGB byte triple -> weighted OKLab. */
export function toLab(
  r: number,
  g: number,
  b: number,
  chromaWeight: number,
): Lab {
  return linToLab(lin(r), lin(g), lin(b), chromaWeight);
}

/** Palette pre-converted to weighted OKLab + linear RGB for fast inner loops. */
export interface PaletteLab {
  readonly count: number;
  /** Weighted OKLab channels, one entry per palette color. */
  readonly L: Float32Array;
  readonly A: Float32Array;
  readonly B: Float32Array;
  /** Linear-RGB channels (for gamma-correct mixing, e.g. Yliluoma). */
  readonly lr: Float32Array;
  readonly lg: Float32Array;
  readonly lb: Float32Array;
}

export function buildPaletteLab(
  palette: readonly (readonly [number, number, number])[],
  chromaWeight: number,
): PaletteLab {
  const count = palette.length;
  const L = new Float32Array(count);
  const A = new Float32Array(count);
  const B = new Float32Array(count);
  const lrA = new Float32Array(count);
  const lgA = new Float32Array(count);
  const lbA = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = palette[i][0];
    const g = palette[i][1];
    const b = palette[i][2];
    const lr = lin(r);
    const lg = lin(g);
    const lb = lin(b);
    lrA[i] = lr;
    lgA[i] = lg;
    lbA[i] = lb;
    const [l, a, bb] = linToLab(lr, lg, lb, chromaWeight);
    L[i] = l;
    A[i] = a;
    B[i] = bb;
  }
  return { count, L, A, B, lr: lrA, lg: lgA, lb: lbA };
}

/** Index of the nearest palette color to a weighted-OKLab point. */
export function nearestLab(
  pal: PaletteLab,
  L: number,
  a: number,
  b: number,
): number {
  let best = 0;
  let bestD = Infinity;
  const { count, L: pL, A: pA, B: pB } = pal;
  for (let i = 0; i < count; i++) {
    const dL = L - pL[i];
    const da = a - pA[i];
    const db = b - pB[i];
    const d = dL * dL + da * da + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
