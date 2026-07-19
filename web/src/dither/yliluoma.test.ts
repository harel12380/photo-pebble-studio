import { describe, it, expect } from 'vitest';
import { ditherYliluoma } from './yliluoma';
import { buildPaletteLab, toLab } from './oklab';
import { PALETTE_RGB, PALETTE } from '../cardFormat';
import { DEFAULT_CHROMA_WEIGHT } from '../types';

/** Build an 8x8 sRGB(A) buffer plus its weighted-OKLab buffer for a single flat color. */
function flatBuffers(width: number, height: number, r: number, g: number, b: number, chromaWeight: number) {
  const n = width * height;
  const srgb = new Uint8ClampedArray(n * 4);
  const bufLab = new Float32Array(n * 3);
  const [L, a, bb] = toLab(r, g, b, chromaWeight);
  for (let i = 0; i < n; i++) {
    srgb[i * 4] = r;
    srgb[i * 4 + 1] = g;
    srgb[i * 4 + 2] = b;
    srgb[i * 4 + 3] = 255;
    bufLab[i * 3] = L;
    bufLab[i * 3 + 1] = a;
    bufLab[i * 3 + 2] = bb;
  }
  return { srgb, bufLab };
}

describe('ditherYliluoma', () => {
  const chromaWeight = DEFAULT_CHROMA_WEIGHT;
  const pal = buildPaletteLab(PALETTE_RGB, chromaWeight);

  it('returns one valid palette index per pixel for a flat mid-tone image', () => {
    // 8x8 so the 8x8 Bayer threshold tile is fully exercised.
    const { srgb, bufLab } = flatBuffers(8, 8, 128, 100, 90, chromaWeight);
    const indices = ditherYliluoma(srgb, bufLab, 8, 8, pal, chromaWeight);

    expect(indices).toHaveLength(64);
    for (const v of indices) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(PALETTE.length);
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('a flat mid-gray tile is dithered using more than one palette color (positional mixing)', () => {
    const { srgb, bufLab } = flatBuffers(8, 8, 128, 128, 128, chromaWeight);
    const indices = ditherYliluoma(srgb, bufLab, 8, 8, pal, chromaWeight);

    const used = new Set(indices);
    for (const v of used) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(PALETTE.length);
    }
    // A flat 8x8 mid-tone gets a positional mixing plan with more than one
    // palette color across the tile (the whole point of Yliluoma dithering).
    expect(used.size).toBeGreaterThan(1);
  });

  it('a flat pure-palette color dithers to a single uniform index', () => {
    // Pure red is exactly palette entry "red" — the mixing plan should
    // trivially be all "red", regardless of threshold position.
    const redIdx = PALETTE.findIndex((c) => c.id === 'red');
    const [r, g, b] = PALETTE_RGB[redIdx];
    const { srgb, bufLab } = flatBuffers(8, 8, r, g, b, chromaWeight);
    const indices = ditherYliluoma(srgb, bufLab, 8, 8, pal, chromaWeight);

    for (const v of indices) {
      expect(v).toBe(redIdx);
    }
  });

  it('handles a non-multiple-of-8 image size', () => {
    const { srgb, bufLab } = flatBuffers(5, 3, 60, 80, 40, chromaWeight);
    const indices = ditherYliluoma(srgb, bufLab, 5, 3, pal, chromaWeight);
    expect(indices).toHaveLength(15);
    for (const v of indices) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(PALETTE.length);
    }
  });

  it('is deterministic for the same input', () => {
    const a = flatBuffers(8, 8, 90, 140, 200, chromaWeight);
    const b = flatBuffers(8, 8, 90, 140, 200, chromaWeight);
    const ia = ditherYliluoma(a.srgb, a.bufLab, 8, 8, pal, chromaWeight);
    const ib = ditherYliluoma(b.srgb, b.bufLab, 8, 8, pal, chromaWeight);
    expect(Array.from(ia)).toEqual(Array.from(ib));
  });
});
