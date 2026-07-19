import { linToLab, type PaletteLab } from './oklab';
import { getOrderedMap } from './ordered';

/**
 * Joel Yliluoma's positional palette dithering (algorithm 2), the standout for
 * color realism on a tiny saturated palette: instead of perturbing-and-snapping,
 * it builds, for each target color, a 64-entry "mixing plan" of palette colors
 * whose gamma-correct (linear-RGB) average best approximates the target, sorts the
 * plan by lightness, and picks plan[bayer8(x,y)]. This synthesizes in-between
 * colors the palette can't hit directly (red+yellow→orange, blue+white→sky) with
 * zero error propagation — so it's stateless and pan-stable like ordered dither
 * but far richer.
 *
 * The plan is indexed positionally by a void-and-cluster **blue-noise** mask
 * rather than an 8×8 Bayer matrix: Bayer's regular cross-hatch tiles the image
 * with a visible grid (especially on the smooth gradients this algorithm targets),
 * whereas the blue-noise mask has no low-frequency energy, so the residual texture
 * reads as fine film grain. The mask is the same one ordered dither uses, generated
 * and cached once.
 *
 * The per-target plan search is memoized in a lazy LUT keyed on the input color
 * quantized to 5 bits/channel, so runtime is effectively O(1) per pixel.
 */

const PLAN = 64; // mixing-plan length

/**
 * Luminance-spread penalty weight for plan building (see buildPlan). Kept small:
 * a larger value calms salt-and-pepper flicker but suppresses the very mixing
 * that lets the palette synthesize pale colors — e.g. a bright sky needs dark
 * blue stippled into white, and too high a penalty (0.6 was) collapses that to
 * near-pure white (only ~9% blue). 0.15 keeps gentle tonal cohesion while still
 * letting pale blues/greens/etc. hold their hue (~28% blue on the same sky).
 */
const LUMA_PENALTY = 0.15;

export function ditherYliluoma(
  srgb: Uint8ClampedArray,
  bufLab: Float32Array,
  width: number,
  height: number,
  pal: PaletteLab,
  chromaWeight: number,
): Uint8Array {
  const n = width * height;
  const indices = new Uint8Array(n);
  const { thresh, size: ms } = getOrderedMap('blue-noise');
  const cache = new Map<number, Uint8Array>();

  const buildPlan = (tL: number, ta: number, tb: number): Uint8Array => {
    const plan = new Uint8Array(PLAN);
    let sumLr = 0;
    let sumLg = 0;
    let sumLb = 0;
    for (let slot = 0; slot < PLAN; slot++) {
      const k = slot + 1;
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < pal.count; c++) {
        const [L, a, b] = linToLab(
          (sumLr + pal.lr[c]) / k,
          (sumLg + pal.lg[c]) / k,
          (sumLb + pal.lb[c]) / k,
          chromaWeight,
        );
        const dL = L - tL;
        const da = a - ta;
        const db = b - tb;
        // Base error: how close the running gamma-correct mix average is to the
        // target. Plus a gentle luminance-spread penalty (Yliluoma's own trick):
        // candidates whose own lightness is far from the target make the tile
        // alternate between very light and very dark members, which reads as
        // salt-and-pepper flicker rather than a smooth blend. Penalizing that
        // spread keeps the plan tonally tight without killing genuine color
        // mixing (chroma error still dominates the choice for saturated tones).
        const spread = pal.L[c] - tL;
        const d = (dL * dL + da * da + db * db) * (1 + LUMA_PENALTY * spread * spread);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      plan[slot] = bestC;
      sumLr += pal.lr[bestC];
      sumLg += pal.lg[bestC];
      sumLb += pal.lb[bestC];
    }
    // Sort the plan by palette lightness so indexing by an ordered threshold
    // distributes light/dark members smoothly across the tile.
    return plan.sort((x, y) => pal.L[x] - pal.L[y]);
  };

  for (let y = 0; y < height; y++) {
    const ty = (y % ms) * ms;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = srgb[i * 4];
      const g = srgb[i * 4 + 1];
      const b = srgb[i * 4 + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let plan = cache.get(key);
      if (!plan) {
        plan = buildPlan(bufLab[i * 3], bufLab[i * 3 + 1], bufLab[i * 3 + 2]);
        cache.set(key, plan);
      }
      let bi = (thresh[ty + (x % ms)] * PLAN) | 0;
      if (bi >= PLAN) bi = PLAN - 1;
      indices[i] = plan[bi];
    }
  }
  return indices;
}
