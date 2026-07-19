import { describe, it, expect } from 'vitest';
import { autoToneFromHistogram } from './autoTone';

/** A 256-bin histogram with `count` pixels spread uniformly over [lo, hi]. */
function rampHistogram(lo: number, hi: number, count = 10000): Uint32Array {
  const hist = new Uint32Array(256);
  const span = hi - lo;
  for (let i = 0; i < count; i++) {
    const v = span === 0 ? lo : lo + Math.round((i / (count - 1)) * span);
    hist[v]++;
  }
  return hist;
}

describe('autoToneFromHistogram', () => {
  it('falls back to a gentle lift for an empty histogram', () => {
    expect(autoToneFromHistogram(new Uint32Array(256))).toEqual({ brightness: 8, contrast: 20 });
  });

  it('falls back to a gentle lift for a near-flat (single-tone) histogram', () => {
    const hist = new Uint32Array(256);
    hist[128] = 5000;
    expect(autoToneFromHistogram(hist)).toEqual({ brightness: 8, contrast: 20 });
  });

  it('barely touches an already well-exposed image', () => {
    const tone = autoToneFromHistogram(rampHistogram(4, 251));
    expect(tone.brightness).toBeGreaterThanOrEqual(-2);
    expect(tone.brightness).toBeLessThanOrEqual(2);
    // Contrast is floored to a small panel-friendly minimum.
    expect(tone.contrast).toBeGreaterThanOrEqual(8);
    expect(tone.contrast).toBeLessThanOrEqual(12);
  });

  it('brightens a dim image (tones bunched in the lower half)', () => {
    const tone = autoToneFromHistogram(rampHistogram(0, 128));
    expect(tone.brightness).toBeGreaterThan(40);
  });

  it('adds contrast to a low-contrast image (tones bunched in the middle)', () => {
    const tone = autoToneFromHistogram(rampHistogram(96, 160));
    expect(tone.contrast).toBeGreaterThan(40);
  });

  it('keeps outputs within the -100..100 edit model and integral', () => {
    for (const [lo, hi] of [[0, 10], [0, 255], [200, 255], [10, 40]]) {
      const tone = autoToneFromHistogram(rampHistogram(lo, hi));
      for (const v of [tone.brightness, tone.contrast]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
