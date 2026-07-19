import { describe, it, expect } from 'vitest';
import { DIFFUSION_KERNELS } from './kernels';

describe('DIFFUSION_KERNELS', () => {
  it('all weights sum to 1, except Atkinson which sums to 6/8', () => {
    for (const [name, kernel] of Object.entries(DIFFUSION_KERNELS)) {
      const sum = kernel!.reduce((acc, { w }) => acc + w, 0);
      if (name === 'atkinson') {
        expect(sum).toBeCloseTo(6 / 8, 6);
      } else {
        expect(sum).toBeCloseTo(1, 6);
      }
    }
  });

  it('every cell has dy >= 0 (no diffusion to already-processed rows)', () => {
    for (const kernel of Object.values(DIFFUSION_KERNELS)) {
      for (const { dy } of kernel!) {
        expect(dy).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cells on the current row (dy === 0) only diffuse ahead (dx > 0)', () => {
    for (const kernel of Object.values(DIFFUSION_KERNELS)) {
      for (const { dx, dy } of kernel!) {
        if (dy === 0) expect(dx).toBeGreaterThan(0);
      }
    }
  });

  it('all weights are positive', () => {
    for (const kernel of Object.values(DIFFUSION_KERNELS)) {
      for (const { w } of kernel!) {
        expect(w).toBeGreaterThan(0);
      }
    }
  });

  it('floyd-steinberg matches the classic 7/3/5/1 over 16 kernel', () => {
    const fs = DIFFUSION_KERNELS['floyd-steinberg']!;
    expect(fs).toEqual([
      { dx: 1, dy: 0, w: 7 / 16 },
      { dx: -1, dy: 1, w: 3 / 16 },
      { dx: 0, dy: 1, w: 5 / 16 },
      { dx: 1, dy: 1, w: 1 / 16 },
    ]);
  });

  it('stevenson-arce has 12 cells summing to 1 (÷200)', () => {
    const sa = DIFFUSION_KERNELS['stevenson-arce']!;
    expect(sa).toHaveLength(12);
    const sum = sa.reduce((acc, { w }) => acc + w, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('includes all expected diffusion algorithm keys', () => {
    const expectedKeys = [
      'floyd-steinberg',
      'atkinson',
      'jarvis-judice-ninke',
      'stucki',
      'burkes',
      'sierra',
      'sierra-two-row',
      'sierra-lite',
      'fan',
      'shiau-fan',
      'shiau-fan-2',
      'stevenson-arce',
    ];
    for (const key of expectedKeys) {
      expect(DIFFUSION_KERNELS).toHaveProperty(key);
    }
  });
});
