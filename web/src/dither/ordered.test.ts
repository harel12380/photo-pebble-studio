import { describe, it, expect } from 'vitest';
import { getOrderedMap } from './ordered';
import type { OrderedMatrix } from '../types';

const MATRICES: { id: OrderedMatrix; size: number }[] = [
  { id: 'bayer2', size: 2 },
  { id: 'bayer4', size: 4 },
  { id: 'bayer8', size: 8 },
  { id: 'cluster4', size: 4 },
  { id: 'blue-noise', size: 64 },
];

describe('getOrderedMap', () => {
  for (const { id, size } of MATRICES) {
    describe(id, () => {
      it(`has size ${size} and thresh length ${size * size}`, () => {
        const map = getOrderedMap(id);
        expect(map.size).toBe(size);
        expect(map.thresh).toHaveLength(size * size);
      });

      it('all threshold values are within (0,1)', () => {
        const { thresh } = getOrderedMap(id);
        for (const v of thresh) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        }
      });

      it('returns a cached (identical) instance on repeated calls', () => {
        expect(getOrderedMap(id)).toBe(getOrderedMap(id));
      });
    });
  }

  it('bayer and cluster maps have distinct threshold values (no duplicates)', () => {
    for (const { id, size } of MATRICES) {
      if (id === 'blue-noise') continue; // not guaranteed distinct, just bounded
      const { thresh } = getOrderedMap(id);
      const unique = new Set(Array.from(thresh));
      expect(unique.size).toBe(size * size);
    }
  });

  it('bayer2 produces the canonical 2x2 Bayer pattern', () => {
    const { thresh } = getOrderedMap('bayer2');
    // 2x2 Bayer matrix values (0-indexed): [0,2 / 3,1] -> (v+0.5)/4
    expect(Array.from(thresh)).toEqual([0.5 / 4, 2.5 / 4, 3.5 / 4, 1.5 / 4]);
  });

  it('cluster4 produces values derived from the CLUSTER4 spiral', () => {
    const { thresh } = getOrderedMap('cluster4');
    expect(thresh[0]).toBeCloseTo((12 + 0.5) / 16, 6);
    expect(thresh[5]).toBeCloseTo((0 + 0.5) / 16, 6); // center cell, smallest threshold
  });

  it('blue-noise mask covers the full rank range with no NaNs', () => {
    const { thresh } = getOrderedMap('blue-noise');
    let min = Infinity;
    let max = -Infinity;
    for (const v of thresh) {
      expect(Number.isNaN(v)).toBe(false);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(1);
    // With 4096 ranks evenly spaced, the extremes should be near the edges.
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });
});
