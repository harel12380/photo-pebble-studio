import { describe, it, expect } from 'vitest';
import { ditherToIndices } from './algorithms';
import { PALETTE_RGB, PALETTE } from '../cardFormat';
import { DEFAULT_CHROMA_WEIGHT } from '../types';
import type { DitherConfig } from '../types';

/** Build a 2x2 RGBA buffer from 4 [r,g,b,a] pixels (row-major). */
function makeBuffer(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  });
  return px;
}

const baseConfig: Omit<DitherConfig, 'algorithm'> = {
  strength: 1,
  serpentine: true,
  orderedMatrix: 'bayer4',
  sharpness: 0,
  chromaWeight: DEFAULT_CHROMA_WEIGHT,
};

function expectValidIndices(indices: Uint8Array, n: number): void {
  expect(indices).toHaveLength(n);
  for (const v of indices) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(PALETTE.length);
    expect(Number.isNaN(v)).toBe(false);
  }
}

// A 2x2 image: black, white, red, blue (all opaque) — exercises distinct
// palette colors directly.
const twoByTwo: [number, number, number, number][] = [
  [0, 0, 0, 255],
  [255, 255, 255, 255],
  [200, 40, 40, 255],
  [40, 60, 180, 255],
];

describe('ditherToIndices', () => {
  it('"nearest" maps pure palette colors to their exact palette index', () => {
    const px = makeBuffer(twoByTwo);
    const indices = ditherToIndices(px, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'nearest',
      strength: 0,
    });
    expectValidIndices(indices, 4);
    // PALETTE order: black=0, white=1, ..., red=3, blue=4
    expect(indices[0]).toBe(0); // black
    expect(indices[1]).toBe(1); // white
    expect(indices[2]).toBe(3); // red
    expect(indices[3]).toBe(4); // blue
  });

  it('"nearest" composites transparent pixels over white', () => {
    // A fully transparent black pixel should become white after compositing.
    const px = makeBuffer([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const indices = ditherToIndices(px, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'nearest',
      strength: 0,
    });
    expectValidIndices(indices, 4);
    expect(Array.from(indices)).toEqual([1, 1, 1, 1]); // all white

    // The alpha channel of the (mutated) input buffer is forced to 255.
    expect(px[3]).toBe(255);
    expect(px[7]).toBe(255);
  });

  it('floyd-steinberg diffusion produces valid indices for a small image', () => {
    const px = makeBuffer(twoByTwo);
    const indices = ditherToIndices(px, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'floyd-steinberg',
    });
    expectValidIndices(indices, 4);
  });

  it('floyd-steinberg without serpentine is deterministic and valid', () => {
    const px = makeBuffer(twoByTwo);
    const indices = ditherToIndices(px, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'floyd-steinberg',
      serpentine: false,
    });
    expectValidIndices(indices, 4);
  });

  it('a checkerboard of near-black/near-white dithers to only black/white indices', () => {
    // 10 and 240 each nearest-match black/white on their own; diffused error
    // should keep the result within that pair.
    const px = makeBuffer(
      Array.from({ length: 16 }, (_, i) => {
        const v = i % 2 === 0 ? 10 : 240;
        return [v, v, v, 255] as [number, number, number, number];
      }),
    );
    const indices = ditherToIndices(px, 4, 4, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'floyd-steinberg',
    });
    expectValidIndices(indices, 16);
    const blackIdx = PALETTE.findIndex((c) => c.id === 'black');
    const whiteIdx = PALETTE.findIndex((c) => c.id === 'white');
    for (const v of indices) {
      expect([blackIdx, whiteIdx]).toContain(v);
    }
  });

  it('"ordered" dithering produces valid indices', () => {
    const px = makeBuffer(
      Array.from({ length: 16 }, () => [128, 128, 128, 255] as [number, number, number, number]),
    );
    const indices = ditherToIndices(px, 4, 4, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'ordered',
      orderedMatrix: 'bayer4',
    });
    expectValidIndices(indices, 16);
  });

  it('"riemersma" (Hilbert curve) produces valid indices', () => {
    const px = makeBuffer(
      Array.from({ length: 16 }, (_, i) => twoByTwo[i % 4]),
    );
    const indices = ditherToIndices(px, 4, 4, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'riemersma',
    });
    expectValidIndices(indices, 16);
  });

  it('"yliluoma" produces valid indices', () => {
    const px = makeBuffer(
      Array.from({ length: 16 }, (_, i) => [100 + i * 5, 80, 60, 255] as [number, number, number, number]),
    );
    const indices = ditherToIndices(px, 4, 4, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'yliluoma',
    });
    expectValidIndices(indices, 16);
  });

  it('applies sharpening before dithering without producing NaNs/out-of-range', () => {
    const px = makeBuffer(
      Array.from({ length: 16 }, (_, i) => [(i * 17) % 256, (i * 31) % 256, (i * 53) % 256, 255] as [number, number, number, number]),
    );
    const indices = ditherToIndices(px, 4, 4, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'floyd-steinberg',
      sharpness: 0.8,
    });
    expectValidIndices(indices, 16);
  });

  it('riemersma chroma-gated jitter: a flat neutral stays black/white instead of spraying colour', () => {
    const blockOf = (rgb: [number, number, number], side: number) =>
      makeBuffer(
        Array.from({ length: side * side }, () => [...rgb, 255] as [number, number, number, number]),
      );
    const cfg = { ...baseConfig, algorithm: 'riemersma' as const };
    const side = 24;
    const count = (idx: Uint8Array, id: string) => {
      const pi = PALETTE.findIndex((c) => c.id === id);
      let c = 0;
      for (const v of idx) if (v === pi) c++;
      return c;
    };

    // A flat neutral gray must stay overwhelmingly black/white. Riemersma's
    // match-point jitter breaks its luminance-structural Hilbert blocks, but
    // applied to the chroma axes it used to nudge neutrals clear into saturated
    // palette entries (coloured confetti). Gating the chroma jitter by the
    // pixel's own chroma keeps neutrals clean.
    const gray = ditherToIndices(blockOf([128, 128, 128], side), side, side, PALETTE_RGB, cfg);
    const chromatic = gray.length - count(gray, 'black') - count(gray, 'white');
    expect(chromatic).toBeLessThan(side * side * 0.1);

    // A genuinely saturated teal still mixes both neighbouring palette hues — the
    // gate leaves saturated decorrelation intact.
    const teal = ditherToIndices(blockOf([40, 110, 130], side), side, side, PALETTE_RGB, cfg);
    expect(count(teal, 'blue')).toBeGreaterThan(side * side * 0.1);
    expect(count(teal, 'green')).toBeGreaterThan(side * side * 0.1);
  });

  it('riemersma actually dithers a mid-tone instead of collapsing to one palette colour', () => {
    const blockOf = (rgb: [number, number, number], side: number) =>
      makeBuffer(
        Array.from({ length: side * side }, () => [...rgb, 255] as [number, number, number, number]),
      );
    const cfg = { ...baseConfig, algorithm: 'riemersma' as const };
    const side = 32;
    const count = (idx: Uint8Array, id: string) => {
      const pi = PALETTE.findIndex((c) => c.id === id);
      let c = 0;
      for (const v of idx) if (v === pi) c++;
      return c;
    };

    // A flat mid-grey sits between palette black and white, so a faithful dither
    // must spend a meaningful fraction of BOTH. The accumulated-error clamp once
    // sat so low (0.08) that it throttled the FIFO's feedback below what a
    // mid-tone needs to ever flip, collapsing the whole block to a single nearest
    // colour (blown-out highlights / posterised skin) — which then forced the
    // jitter sky-high to fake texture. Assert the block is a real black/white mix,
    // not a flat fill, so that regression can't return silently.
    const grey = ditherToIndices(blockOf([150, 150, 150], side), side, side, PALETTE_RGB, cfg);
    const n = side * side;
    expect(count(grey, 'black')).toBeGreaterThan(n * 0.1);
    expect(count(grey, 'white')).toBeGreaterThan(n * 0.1);
  });

  it('ordered chroma-gated bias: a flat neutral stays black/white while a saturated mid-hue still mixes', () => {
    const blockOf = (rgb: [number, number, number], side: number) =>
      makeBuffer(
        Array.from({ length: side * side }, () => [...rgb, 255] as [number, number, number, number]),
      );
    const side = 24;
    const count = (idx: Uint8Array, id: string) => {
      const pi = PALETTE.findIndex((c) => c.id === id);
      let c = 0;
      for (const v of idx) if (v === pi) c++;
      return c;
    };

    // Ordered dithering perturbs the (a,b) axes from the threshold tile. Undimmed
    // that bias nudges a flat neutral grey clear into saturated palette entries —
    // ~12% (Bayer) to ~31% (blue-noise) coloured. Gating the chroma bias by the
    // pixel's own chroma keeps neutrals overwhelmingly black/white, matching the
    // floor diffuse()/riemersma() already hold.
    for (const orderedMatrix of ['bayer4', 'bayer8', 'blue-noise'] as const) {
      const cfg = { ...baseConfig, algorithm: 'ordered' as const, orderedMatrix };
      const gray = ditherToIndices(blockOf([128, 128, 128], side), side, side, PALETTE_RGB, cfg);
      const chromatic = gray.length - count(gray, 'black') - count(gray, 'white');
      expect(chromatic).toBeLessThan(side * side * 0.1);

      // A saturated teal must still dither its dominant hue against the neutrals
      // rather than collapsing to a single flat colour — the gate (cRamp ≈ 0.56 at
      // this chroma) leaves genuinely saturated dithering intact.
      const teal = ditherToIndices(blockOf([40, 110, 130], side), side, side, PALETTE_RGB, cfg);
      expect(count(teal, 'green')).toBeGreaterThan(side * side * 0.1);
      const neutral = count(teal, 'white') + count(teal, 'black');
      expect(neutral).toBeGreaterThan(side * side * 0.1);
    }
  });

  it('riemersma clamps teleported error: saturated bars under a bright gradient stay their own hue (no white quadrant blocks)', () => {
    // The Hilbert FIFO integrates error along the curve, which jumps spatially at
    // sub-square boundaries. Without the accumulated-error clamp, the bright error
    // built up over the light part of the gradient gets carried across a jump and
    // dumped into the saturated colour bars below, flipping whole quadrants to
    // white (hard rectangular blocks). Reproduce the harness fixture: a bright
    // diagonal gradient over a strip of saturated hue bars, and assert the bars
    // don't fill with teleported white.
    const S = 128;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    // Diagonal #ff0066 -> #ffcc00 -> #0066ff (matches the visual-harness gradient).
    const grad = (t: number): [number, number, number] => {
      const stops: [number, [number, number, number]][] = [
        [0, [255, 0, 102]],
        [0.5, [255, 204, 0]],
        [1, [0, 102, 255]],
      ];
      let i = 0;
      while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[Math.min(i + 1, stops.length - 1)];
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    };
    const hsl = (h: number): [number, number, number] => {
      const s = 0.9;
      const l = 0.55;
      const k = (n: number) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
      return [255 * f(0), 255 * f(8), 255 * f(4)];
    };
    const px = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const c = y > S * 0.75 ? hsl(Math.floor(x / (S / 7)) * 51) : grad((x / S + y / S) / 2);
        const o = (y * S + x) * 4;
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = 255;
      }
    }
    const indices = ditherToIndices(px, S, S, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'riemersma',
    });
    expectValidIndices(indices, S * S);
    const whiteIdx = PALETTE.findIndex((c) => c.id === 'white');
    let white = 0;
    let n = 0;
    for (let y = Math.floor(S * 0.78); y < Math.floor(S * 0.99); y++) {
      for (let x = 0; x < S; x++) {
        n++;
        if (indices[y * S + x] === whiteIdx) white++;
      }
    }
    // Unclamped this bar region runs ~15% white (solid teleported blocks); the
    // clamp holds it near the diffuse ~4% floor. Assert it stays well under half.
    expect(white / n).toBeLessThan(0.08);
  });

  it('strength=0 error-diffusion behaves like nearest (no error carried)', () => {
    const px1 = makeBuffer(twoByTwo);
    const px2 = makeBuffer(twoByTwo);
    const nearest = ditherToIndices(px1, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'nearest',
    });
    const diffused = ditherToIndices(px2, 2, 2, PALETTE_RGB, {
      ...baseConfig,
      algorithm: 'floyd-steinberg',
      strength: 0,
    });
    expect(Array.from(diffused)).toEqual(Array.from(nearest));
  });
});
