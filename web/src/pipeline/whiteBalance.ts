/**
 * White-balance / color-cast correction for the edit model.
 *
 * The palette is a tiny, very saturated 6-color set (black/white/yellow/red/
 * blue/green). A photo shot under a strong colored light — the canonical case is
 * a dim scene lit by blue LEDs — carries that cast into every pixel, so skin and
 * whites end up with the blue channel highest and the ditherer faithfully
 * quantizes a face to the solid blue entry ("the face disappears into blue").
 * Brightness/contrast/saturation can't undo that: they're channel-symmetric. A
 * per-channel gain (white balance) can.
 *
 * Two user axes, each -100..100, 0 = neutral, matching a camera's controls:
 *   - temperature: blue↔yellow (cool↔warm). Positive warms (boost R, cut B).
 *   - tint:        green↔magenta. Positive is magenta (cut G), negative green.
 *
 * The math lives in log-gain space so the forward gains and the auto estimator
 * are exact inverses of each other, and gains are normalized to unit geometric
 * mean so a neutral gray keeps its brightness — WB only shifts hue, never
 * exposure (that's what brightness/contrast are for).
 */

import type { RGB } from '../cardFormat';
import type { EditState } from '../types';

/** Log-gain per unit of temperature (t = temperature/100). exp(TEMP_K) ≈ 1.82×
 *  on red at full warm, ×0.55 on blue — a strong but sane maximum swing. */
const TEMP_K = 0.6;
/** Log-gain per unit of tint (n = tint/100), on the green channel. */
const TINT_K = 0.6;

function clamp100(v: number): number {
  return v < -100 ? -100 : v > 100 ? 100 : v;
}

/**
 * Per-channel linear gains [gR, gG, gB] for the given temperature/tint.
 * Returns [1,1,1] at neutral. Multiply each 0..255 channel by its gain (clamp
 * to 0..255 after). Gains have unit geometric mean, so neutral gray keeps its
 * level.
 */
export function whiteBalanceGains(temperature: number, tint: number): RGB {
  const t = clamp100(temperature) / 100;
  const n = clamp100(tint) / 100;
  // Temperature pushes R and B apart; tint pushes G against the R/B average
  // (split half into R and B so tint is a clean green↔magenta move, not a
  // green-only dim). All in log space.
  let lgR = TEMP_K * t + (TINT_K * n) / 2;
  let lgG = -TINT_K * n;
  let lgB = -TEMP_K * t + (TINT_K * n) / 2;
  // Normalize to unit geometric mean → luma-preserving on neutral gray.
  const mean = (lgR + lgG + lgB) / 3;
  lgR -= mean;
  lgG -= mean;
  lgB -= mean;
  return [Math.exp(lgR), Math.exp(lgG), Math.exp(lgB)];
}

/** Max auto correction per axis. Temperature (blue↔yellow) casts are common and
 *  benign to over-nudge; green↔magenta casts are rarer and an over-green face or
 *  white is glaring, so tint is capped far tighter. The manual sliders can still
 *  go to the full ±100 when the user wants. */
const AUTO_TEMP_CAP = 70;
const AUTO_TINT_CAP = 12;
/** Below these magnitudes the image is essentially neutral; leave it untouched
 *  so auto-enhance never tints an already well-balanced photo. */
const TEMP_DEADZONE = 6;
const TINT_DEADZONE = 4;

function deadzone(v: number, dz: number): number {
  return Math.abs(v) < dz ? 0 : Math.round(v);
}

/**
 * Gray-world auto white balance: assume the scene's average is neutral and
 * derive the temperature/tint that would neutralize the measured average color.
 * Exact inverse of {@link whiteBalanceGains} (same TEMP_K/TINT_K), then capped
 * and dead-zoned. Returns {0,0} for a balanced or degenerate (black) sample.
 *
 * Gray-world can over-correct a scene that is legitimately dominated by one
 * color (the caller sees this as e.g. a warm hoodie tinting slightly green under
 * a heavy blue cast), which is why the tint cap is deliberately small and the
 * result is only ever a starting point the user can override.
 */
export function autoWhiteBalance(meanR: number, meanG: number, meanB: number): {
  temperature: number;
  tint: number;
} {
  if (meanR < 1 && meanG < 1 && meanB < 1) return { temperature: 0, tint: 0 };
  const lr = Math.log(Math.max(meanR, 1));
  const lg = Math.log(Math.max(meanG, 1));
  const lb = Math.log(Math.max(meanB, 1));
  // Measured cast, in the same axes the forward model produces.
  const redBlue = (lr - lb) / 2; // >0 warm, <0 cool
  const greenExcess = lg - (lr + lb) / 2; // >0 green cast
  // Invert the forward model: solve for t, n that cancel the measured cast.
  const temperature = (-redBlue / TEMP_K) * 100;
  const tint = (greenExcess / TINT_K) * 100;
  const capT = Math.max(-AUTO_TEMP_CAP, Math.min(AUTO_TEMP_CAP, temperature));
  const capN = Math.max(-AUTO_TINT_CAP, Math.min(AUTO_TINT_CAP, tint));
  return {
    temperature: deadzone(capT, TEMP_DEADZONE),
    tint: deadzone(capN, TINT_DEADZONE),
  };
}

/** True when the edit's white balance is a no-op (skip the pixel pass). */
export function isNeutralWhiteBalance(edit: EditState): boolean {
  return edit.temperature === 0 && edit.tint === 0;
}

/**
 * Apply the edit's white balance to an RGBA buffer in place. No-op (and no
 * allocation) when neutral. Alpha is untouched.
 */
export function applyWhiteBalance(data: Uint8ClampedArray, edit: EditState): void {
  if (isNeutralWhiteBalance(edit)) return;
  const [gR, gG, gB] = whiteBalanceGains(edit.temperature, edit.tint);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] * gR;
    const g = data[i + 1] * gG;
    const b = data[i + 2] * gB;
    data[i] = r > 255 ? 255 : r;
    data[i + 1] = g > 255 ? 255 : g;
    data[i + 2] = b > 255 ? 255 : b;
  }
}
