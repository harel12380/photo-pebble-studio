import { describe, it, expect } from 'vitest';
import {
  LIN_LUT,
  lin,
  linToSrgbByte,
  linToLab,
  toLab,
  buildPaletteLab,
  nearestLab,
} from './oklab';
import { PALETTE_RGB } from '../cardFormat';

describe('lin / linToSrgbByte round-trip', () => {
  it('lin(0) is 0 and lin(255) is 1', () => {
    expect(lin(0)).toBe(0);
    expect(lin(255)).toBeCloseTo(1, 6);
  });

  it('linToSrgbByte(0) is 0 and linToSrgbByte(1) is 255', () => {
    expect(linToSrgbByte(0)).toBe(0);
    expect(linToSrgbByte(1)).toBe(255);
  });

  it('round-trips every sRGB byte value through lin -> linToSrgbByte', () => {
    for (let i = 0; i <= 255; i++) {
      expect(linToSrgbByte(lin(i))).toBe(i);
    }
  });

  it('clamps out-of-range inputs', () => {
    expect(lin(-10)).toBe(LIN_LUT[0]);
    expect(lin(300)).toBe(LIN_LUT[255]);
    expect(linToSrgbByte(-1)).toBe(0);
    expect(linToSrgbByte(2)).toBe(255);
  });

  it('LIN_LUT is monotonically increasing', () => {
    for (let i = 1; i < 256; i++) {
      expect(LIN_LUT[i]).toBeGreaterThan(LIN_LUT[i - 1]);
    }
  });
});

describe('linToLab / toLab', () => {
  it('black maps to L=0, a=0, b=0', () => {
    const [L, a, b] = linToLab(0, 0, 0, 3.0);
    expect(L).toBeCloseTo(0, 6);
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it('white maps to L=1, a=0, b=0 regardless of chroma weight', () => {
    const [L, a, b] = linToLab(1, 1, 1, 3.0);
    expect(L).toBeCloseTo(1, 5);
    expect(a).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);

    const [L2, a2, b2] = linToLab(1, 1, 1, 1.0);
    expect(L2).toBeCloseTo(1, 5);
    expect(a2).toBeCloseTo(0, 5);
    expect(b2).toBeCloseTo(0, 5);
  });

  it('scales the a/b (chroma) channels linearly with chromaWeight', () => {
    const [, a1, b1] = linToLab(0.8, 0.2, 0.2, 1.0);
    const [, a2, b2] = linToLab(0.8, 0.2, 0.2, 2.0);
    expect(a2).toBeCloseTo(a1 * 2, 6);
    expect(b2).toBeCloseTo(b1 * 2, 6);
  });

  it('toLab(r,g,b) === linToLab(lin(r),lin(g),lin(b))', () => {
    const a = toLab(128, 64, 200, 3.0);
    const b = linToLab(lin(128), lin(64), lin(200), 3.0);
    expect(a).toEqual(b);
  });

  it('grayscale inputs produce near-zero chroma (a≈0, b≈0)', () => {
    for (const v of [0, 32, 128, 200, 255]) {
      const [, a, b] = toLab(v, v, v, 3.0);
      expect(Math.abs(a)).toBeLessThan(1e-5);
      expect(Math.abs(b)).toBeLessThan(1e-5);
    }
  });

  it('lightness increases monotonically along the gray ramp', () => {
    let prevL = -Infinity;
    for (const v of [0, 64, 128, 192, 255]) {
      const [L] = toLab(v, v, v, 3.0);
      expect(L).toBeGreaterThan(prevL);
      prevL = L;
    }
  });
});

describe('buildPaletteLab', () => {
  const pal = buildPaletteLab(PALETTE_RGB, 3.0);

  it('has one entry per palette color across all channels', () => {
    expect(pal.count).toBe(PALETTE_RGB.length);
    for (const arr of [pal.L, pal.A, pal.B, pal.lr, pal.lg, pal.lb]) {
      expect(arr).toHaveLength(PALETTE_RGB.length);
    }
  });

  it('linear-RGB channels match lin() of the source palette', () => {
    for (let i = 0; i < PALETTE_RGB.length; i++) {
      const [r, g, b] = PALETTE_RGB[i];
      expect(pal.lr[i]).toBeCloseTo(lin(r), 6);
      expect(pal.lg[i]).toBeCloseTo(lin(g), 6);
      expect(pal.lb[i]).toBeCloseTo(lin(b), 6);
    }
  });

  it('OKLab L values are within [0,1] for all palette colors', () => {
    for (let i = 0; i < pal.count; i++) {
      expect(pal.L[i]).toBeGreaterThanOrEqual(0);
      expect(pal.L[i]).toBeLessThanOrEqual(1);
    }
  });

  it('black has the lowest L and white the highest', () => {
    const blackIdx = 0; // PALETTE order: black, white, ...
    const whiteIdx = 1;
    for (let i = 0; i < pal.count; i++) {
      expect(pal.L[blackIdx]).toBeLessThanOrEqual(pal.L[i]);
      expect(pal.L[whiteIdx]).toBeGreaterThanOrEqual(pal.L[i]);
    }
  });

  it('produces no NaNs', () => {
    for (const arr of [pal.L, pal.A, pal.B, pal.lr, pal.lg, pal.lb]) {
      for (const v of arr) expect(Number.isNaN(v)).toBe(false);
    }
  });
});

describe('nearestLab', () => {
  const pal = buildPaletteLab(PALETTE_RGB, 3.0);

  it('finds the exact palette color when given its own coordinates', () => {
    for (let i = 0; i < pal.count; i++) {
      const idx = nearestLab(pal, pal.L[i], pal.A[i], pal.B[i]);
      expect(idx).toBe(i);
    }
  });

  it('returns a valid palette index for an arbitrary OKLab point', () => {
    const idx = nearestLab(pal, 0.5, 0.05, -0.05);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(pal.count);
  });

  it('maps near-black to the black palette entry', () => {
    const [L, a, b] = toLab(5, 5, 5, 3.0);
    const idx = nearestLab(pal, L, a, b);
    expect(idx).toBe(0); // black is index 0 in PALETTE
  });

  it('maps near-white to the white palette entry', () => {
    const [L, a, b] = toLab(250, 250, 250, 3.0);
    const idx = nearestLab(pal, L, a, b);
    expect(idx).toBe(1); // white is index 1 in PALETTE
  });
});
