import type { RGB } from '../cardFormat';
import type { DitherConfig } from '../types';
import { buildPaletteLab, nearestLab, toLab } from './oklab';
import { DIFFUSION_KERNELS } from './kernels';
import { getOrderedMap } from './ordered';
import { hilbertD2XY, hilbertOrder } from './hilbert';
import { ditherYliluoma } from './yliluoma';
import { unsharpMask } from './sharpen';

/**
 * Pure, dependency-free dithering. Runs inside the Web Worker (no DOM/canvas).
 *
 * Input is RGBA bytes; output is one palette index (0..palette.length-1) per
 * pixel. Transparent pixels are composited over white first (e-ink has no alpha).
 * All color matching happens in OKLab with a configurable chroma weight — see
 * oklab.ts for why that's what kills the "neutral snaps to a saturated primary"
 * rainbow speckle on a tiny 6-color palette.
 *
 * Pipeline: optional unsharp mask -> composite over white -> per-family dither.
 */

/** Floor for the fraction of chroma (a,b) quantization error propagated by error
 *  diffusion, applied to *neutral* pixels. Lightness error diffuses fully; chroma
 *  is attenuated to stop colour speckle from accumulating in neutral/dark regions.
 *  Saturated pixels ramp back up toward full diffusion (see CHROMA_FULL_SAT and
 *  diffuse() for the full rationale). */
const CHROMA_ERROR_DIFFUSION = 0.5;

/** Unweighted OKLab chroma at (or above) which a pixel's chroma error diffuses
 *  in *full* (factor 1.0), ramping linearly up from the neutral floor. The knee
 *  is multiplied by chromaWeight at use so it tracks the weighted (a,b) the
 *  matcher actually sees. A flat attenuation cleans neutrals but also starves
 *  genuinely saturated gradients of the chroma error they need to dither,
 *  collapsing e.g. a green↔cyan ramp to a single muddy hue; ramping with the
 *  pixel's own chroma fixes that while leaving neutral/skin/dark regions at the
 *  clean floor. Set near the palette's mid chroma (unweighted green≈0.11, the
 *  bright primaries≈0.19) so saturated colour gets near-full hue mixing. */
const CHROMA_FULL_SAT = 0.135;

/** Threshold-jitter amplitude for perturbed error diffusion (see diffuse()).
 *  Tiny, zero-mean noise added to the *match* point only (never to the
 *  propagated error), in weighted-OKLab units. Breaks the deterministic limit
 *  cycles that make compact kernels (Floyd–Steinberg above all) lock into a
 *  regular checkerboard/maze on smooth gradients. AMP_C scales with the chroma
 *  weight so it stays a fixed fraction of palette spacing in the (a,b) plane. */
const JITTER_AMP_L = 0.05;
const JITTER_AMP_C = 0.03;

/** Riemersma's decision-dither nudge, as a multiple of the base error-diffusion
 *  jitter. Once the accumulated-error clamp is loose enough to let the FIFO
 *  actually dither (see RIEMERSMA_ACCUM_CLAMP), the curve only needs a *mild*
 *  match-point nudge to decorrelate its 1D limit cycles — the same order as the
 *  2D kernels. A large multiple (this was 4×) instead floods smooth/flat regions
 *  with white-noise speckle, which is exactly the grain it used to produce. */
const RIEMERSMA_JITTER_SCALE = 0.5;

/** Per-axis ceiling on the *accumulated* error the Riemersma FIFO may add to a
 *  pixel (weighted-OKLab units). The error window integrates along the 1D Hilbert
 *  traversal, but the curve makes large spatial jumps at sub-square boundaries, so
 *  the running error built up over a bright region gets carried across a jump and
 *  dumped wholesale into a spatially distant, often saturated region — flipping a
 *  whole Hilbert quadrant to white/grey with hard axis-aligned edges (the solid
 *  rectangular blocks this curve is notorious for, e.g. white squares punched into
 *  saturated colour bars). Capping the *summed* feedback per pixel lets ordinary
 *  small dithering error through untouched while stopping a single teleported burst
 *  from overwhelming the local colour: it dissolves the quadrant blocks with no
 *  effect on flat regions (their accumulated error never approaches the cap).
 *
 *  This MUST stay well above the per-pixel error a mid-tone needs fed back to
 *  flip palette entries (~0.4–0.5 in OKLab L to push a mid-grey to black). An
 *  earlier value of 0.08 throttled that legitimate feedback so hard that bright
 *  and mid-tone regions stopped dithering altogether — collapsing to flat
 *  nearest-match (blown-out highlights, posterised skin) — which in turn forced
 *  the jitter up to 4× to fake the missing texture, spraying speckle everywhere.
 *  At 0.5 the FIFO dithers smoothly again while still capping true teleport
 *  bursts (which sit near the full ±1 error range). */
const RIEMERSMA_ACCUM_CLAMP = 0.5;

/** Deterministic per-pixel value noise in [-1, 1). Hash-based (not Math.random)
 *  so previews are stable across re-renders — no shimmer — while still being
 *  spatially decorrelated enough to break period-2 limit cycles. */
function hashNoise(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0xffffffff) * 2 - 1;
}

export function ditherToIndices(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  palette: readonly RGB[],
  config: DitherConfig,
): Uint8Array {
  const n = width * height;
  const indices = new Uint8Array(n);

  // 1. Sharpen (operates on RGB; ignores alpha).
  if (config.sharpness > 0) unsharpMask(pixels, width, height, config.sharpness);

  // 2. Palette -> weighted OKLab (+ linear RGB for Yliluoma mixing).
  const pal = buildPaletteLab(palette, config.chromaWeight);

  // 3. Composite alpha over white, in place, and build the OKLab target buffer.
  const buf = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const alpha = pixels[o + 3] / 255;
    const inv = 1 - alpha;
    const r = pixels[o] * alpha + 255 * inv;
    const g = pixels[o + 1] * alpha + 255 * inv;
    const b = pixels[o + 2] * alpha + 255 * inv;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = 255;
    const [L, A, B] = toLab(r, g, b, config.chromaWeight);
    buf[i * 3] = L;
    buf[i * 3 + 1] = A;
    buf[i * 3 + 2] = B;
  }

  // 4. Dispatch by family.
  if (config.algorithm === 'nearest') {
    for (let i = 0; i < n; i++) {
      indices[i] = nearestLab(pal, buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
    }
    return indices;
  }

  if (config.algorithm === 'yliluoma') {
    return ditherYliluoma(pixels, buf, width, height, pal, config.chromaWeight);
  }

  if (config.algorithm === 'ordered') {
    const { size, thresh } = getOrderedMap(config.orderedMatrix);
    const ampL = 0.55 * config.strength;
    const ampC = 0.4 * config.strength;
    // Drive the two chroma axes from two *decorrelated* threshold samples: the
    // B axis reads a half-tile-shifted cell so the chroma perturbation fills the
    // whole (a,b) plane instead of sliding along the a≈b diagonal. With a single
    // shared bias, ordered dithering can only mix palette colors separated along
    // that diagonal, so gradients running across it (e.g. red↔green) band; the
    // shifted second sample lets every hue transition dither. Luminance keeps the
    // primary sample so the dot pattern stays coherent.
    //
    // Gate the *chroma* bias by the pixel's own chroma, exactly as diffuse() and
    // riemersma() gate their match-point jitter (see there). Undimmed, the (a,b)
    // perturbation nudges low-chroma pixels clear into a saturated palette entry,
    // spraying colour speckle through neutral/skin/dark regions that should stay
    // clean — a flat neutral grey came out ~12% (Bayer) to ~31% (blue-noise)
    // coloured. Ramping the chroma bias from ~0 at neutral up to full at the
    // saturation knee keeps neutrals on the clean black/white floor while leaving
    // genuinely saturated gradients their full hue dithering. Luminance bias stays
    // ungated so the dot texture is untouched.
    const half = size >> 1;
    const chromaKnee = CHROMA_FULL_SAT * config.chromaWeight;
    for (let y = 0; y < height; y++) {
      const ty = (y % size) * size;
      const tyB = ((y + half) % size) * size;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const a = buf[i * 3 + 1];
        const b = buf[i * 3 + 2];
        const chroma = Math.sqrt(a * a + b * b);
        const cRamp = chroma >= chromaKnee ? 1 : chroma / chromaKnee;
        const ampCg = ampC * cRamp;
        const bias = thresh[ty + (x % size)] - 0.5;
        const biasB = thresh[tyB + ((x + half) % size)] - 0.5;
        indices[i] = nearestLab(
          pal,
          buf[i * 3] + bias * ampL,
          a + bias * ampCg,
          b + biasB * ampCg,
        );
      }
    }
    return indices;
  }

  if (config.algorithm === 'riemersma') {
    riemersma(buf, indices, width, height, pal, config.strength, config.chromaWeight);
    return indices;
  }

  // Error diffusion.
  diffuse(buf, indices, width, height, pal, config);
  return indices;
}

function diffuse(
  buf: Float32Array,
  indices: Uint8Array,
  width: number,
  height: number,
  pal: ReturnType<typeof buildPaletteLab>,
  config: DitherConfig,
): void {
  const kernel = DIFFUSION_KERNELS[config.algorithm];
  if (!kernel) {
    // Unknown kernel -> fall back to nearest (defensive).
    for (let i = 0; i < width * height; i++) {
      indices[i] = nearestLab(pal, buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
    }
    return;
  }
  const klen = kernel.length;
  const sAmt = config.strength < 0 ? 0 : config.strength > 1 ? 1 : config.strength;
  // Lightness error diffuses in full, but chroma error is attenuated. On a tiny
  // saturated palette the chroma quantization error of low-chroma pixels has
  // nowhere good to go, so when fully propagated it ACCUMULATES through neutral
  // and dark regions and erupts as red/green/yellow speckle far from any real
  // colour — e.g. a warm-lit dark background turning into colour confetti, or a
  // bright shirt's hue "spreading" across the frame. Halving the diffused chroma
  // error keeps those areas clean (warm-dark colour speckle ~34%→~10% in tests)
  // while genuinely saturated regions are unaffected — they get their colour
  // from the direct nearest-match, not from accumulated error (sky blue and skin
  // tones hold within ~1%). Lightness dithering stays crisp.
  const chromaErr = CHROMA_ERROR_DIFFUSION;

  // Perturbed error diffusion: jitter the *decision* (which palette color is
  // nearest) by a tiny zero-mean noise, but compute the propagated error from
  // the true value so energy is still conserved. Without this, Floyd–Steinberg's
  // compact kernel limit-cycles on smooth gradients and erupts into a regular
  // red/yellow checkerboard maze (clearly worse than Atkinson/ordered on the same
  // gradient). The nudge is enough to decorrelate that period-2 pattern while
  // leaving flat regions and the overall tone untouched. Scaled by strength so
  // strength=0 stays exactly nearest-match.
  const jitL = JITTER_AMP_L * sAmt;
  const jitC = JITTER_AMP_C * config.chromaWeight * sAmt;

  for (let y = 0; y < height; y++) {
    const ltr = !config.serpentine || (y & 1) === 0;
    const xStart = ltr ? 0 : width - 1;
    const xEnd = ltr ? width : -1;
    const xStep = ltr ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const idx = (y * width + x) * 3;
      const L = buf[idx];
      const a = buf[idx + 1];
      const b = buf[idx + 2];
      const pi = nearestLab(
        pal,
        L + hashNoise(x, y, 1) * jitL,
        a + hashNoise(x, y, 2) * jitC,
        b + hashNoise(x, y, 3) * jitC,
      );
      indices[y * width + x] = pi;

      const eL = (L - pal.L[pi]) * sAmt;
      const eA = (a - pal.A[pi]) * sAmt * chromaErr;
      const eB = (b - pal.B[pi]) * sAmt * chromaErr;
      for (let kk = 0; kk < klen; kk++) {
        const ke = kernel[kk];
        const nx = x + (ltr ? ke.dx : -ke.dx);
        const ny = y + ke.dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const nidx = (ny * width + nx) * 3;
        buf[nidx] += eL * ke.w;
        buf[nidx + 1] += eA * ke.w;
        buf[nidx + 2] += eB * ke.w;
      }
    }
  }
}

/** Riemersma (Hilbert-curve) dithering with an exponentially-weighted error FIFO. */
function riemersma(
  buf: Float32Array,
  indices: Uint8Array,
  width: number,
  height: number,
  pal: ReturnType<typeof buildPaletteLab>,
  strength: number,
  chromaWeight: number,
): void {
  // Perturbed decision, same trick diffuse() uses to kill the Floyd–Steinberg
  // checkerboard (see there). Riemersma's error FIFO integrates along the 1D
  // Hilbert traversal, so within each curve sub-square the running error tips a
  // whole quadrant the same way at once — erupting as axis-aligned rectangular
  // blocks (white/yellow patches on a light gradient) bounded by the curve's
  // quadrant grid. Nudging the *match point* (never the propagated error) by a
  // tiny zero-mean per-pixel hash noise decorrelates which pixels tip, so those
  // sharp block edges dissolve into a stochastic mix while tone is preserved.
  // Scaled by strength so strength=0 stays exactly nearest-match.
  // Stronger than diffuse()'s nudge: error diffusion spreads error across the 2D
  // neighborhood, but Riemersma's 1D FIFO does not, so its blocks are coarse and
  // structural (whole quadrants) rather than the period-2 cycles a tiny nudge
  // fixes — they need a firmer decision dither to break up.
  const jitL = RIEMERSMA_JITTER_SCALE * JITTER_AMP_L * strength;
  const jitC = RIEMERSMA_JITTER_SCALE * JITTER_AMP_C * chromaWeight * strength;
  // The 4× jitter is needed on *luminance* — the Hilbert blocks it breaks up are
  // luminance-structural (a whole quadrant tipping light/dark). But at 4× the
  // *chroma* axis it nudges low-chroma pixels clear into a saturated palette
  // entry, so a flat neutral region erupts into red/green/blue confetti (a plain
  // gray block came out ~67% coloured). So gate the chroma jitter by the pixel's
  // own chroma, ramping from ~0 at neutral up to full at the saturation knee: this
  // keeps neutral/dark/skin regions clean while still decorrelating which
  // saturated pixels tip. Luminance jitter stays full so the block-breaking holds.
  const chromaKnee = CHROMA_FULL_SAT * chromaWeight;
  // Longer, gentler-decaying error window than the classic (16, 16). The short,
  // steep window integrates error over too few, too-recent pixels to bridge the
  // Hilbert curve's quadrant transitions, so on smooth gradients the dither
  // boundary snaps to the curve's axis-aligned sub-square edges instead of
  // following the image gradient (visible blocky rectangles). Spreading the same
  // conserved error across ~32 pixels with a shallower falloff decorrelates it
  // from any single curve direction, softening those boundaries.
  const Q = 32;
  const ratio = 8;
  // Weight per age (0 = newest); normalized to sum 1 so error is conserved.
  const W = new Float64Array(Q);
  let wsum = 0;
  for (let i = 0; i < Q; i++) {
    W[i] = Math.pow(1 / ratio, i / (Q - 1));
    wsum += W[i];
  }
  for (let i = 0; i < Q; i++) W[i] /= wsum;

  const qL = new Float64Array(Q);
  const qA = new Float64Array(Q);
  const qB = new Float64Array(Q);
  let head = 0;

  const order = hilbertOrder(width, height);
  const total = 1 << (2 * order);
  for (let d = 0; d < total; d++) {
    const [x, y] = hilbertD2XY(order, d);
    if (x >= width || y >= height) continue;
    const i = y * width + x;

    let sL = 0;
    let sA = 0;
    let sB = 0;
    for (let age = 0; age < Q; age++) {
      const j = (head - age + Q) % Q;
      sL += W[age] * qL[j];
      sA += W[age] * qA[j];
      sB += W[age] * qB[j];
    }
    // Bound the teleported feedback (see RIEMERSMA_ACCUM_CLAMP) so a burst of
    // error carried across a Hilbert sub-square jump can't flip a whole quadrant.
    const C = RIEMERSMA_ACCUM_CLAMP;
    if (sL < -C) sL = -C;
    else if (sL > C) sL = C;
    if (sA < -C) sA = -C;
    else if (sA > C) sA = C;
    if (sB < -C) sB = -C;
    else if (sB > C) sB = C;
    const L = buf[i * 3] + sL;
    const a = buf[i * 3 + 1] + sA;
    const b = buf[i * 3 + 2] + sB;
    const chroma = Math.sqrt(a * a + b * b);
    const cJit = (chroma >= chromaKnee ? 1 : chroma / chromaKnee) * jitC;
    const pi = nearestLab(
      pal,
      L + hashNoise(x, y, 1) * jitL,
      a + hashNoise(x, y, 2) * cJit,
      b + hashNoise(x, y, 3) * cJit,
    );
    indices[i] = pi;

    head = (head + 1) % Q;
    // Attenuate chroma error in the FIFO for the same reason diffuse() does (see
    // CHROMA_ERROR_DIFFUSION). The Hilbert curve makes large spatial jumps at
    // sub-square boundaries, so a long error window carries accumulated chroma
    // error across those jumps and dumps it into a spatially distant region —
    // erupting as the solid saturated rectangles (green/red blocks aligned to the
    // curve's quadrant grid) that this curve is prone to on a tiny 6-color
    // palette. So neutrals diffuse chroma only at the floor, keeping those blocks
    // from forming, while full luminance error preserves the dither texture.
    // But a *flat* floor also starves genuinely saturated gradients of the chroma
    // error they need to dither, collapsing e.g. a green↔cyan ramp to one muddy
    // hue — the same trap diffuse() hit before commit 9967359. So ramp the
    // diffused chroma fraction from the floor up to 1.0 as the pixel's own chroma
    // approaches the saturation knee (reusing the `chroma` already computed for the
    // jitter gate), giving saturated regions proper hue mixing while leaving
    // neutral/dark/skin at the clean floor.
    const cErrT = chroma >= chromaKnee ? 1 : chroma / chromaKnee;
    const chromaErr = CHROMA_ERROR_DIFFUSION + (1 - CHROMA_ERROR_DIFFUSION) * cErrT;
    qL[head] = (L - pal.L[pi]) * strength;
    qA[head] = (a - pal.A[pi]) * strength * chromaErr;
    qB[head] = (b - pal.B[pi]) * strength * chromaErr;
  }
}
