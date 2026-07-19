import { describe, it, expect } from 'vitest';
import { hilbertOrder, hilbertD2XY } from './hilbert';

describe('hilbertOrder', () => {
  it('returns 0 for 1x1 (and degenerate 0-size) inputs', () => {
    expect(hilbertOrder(1, 1)).toBe(0);
    expect(hilbertOrder(0, 0)).toBe(0);
  });

  it('returns the smallest order with 2^order >= max(width,height)', () => {
    expect(hilbertOrder(2, 2)).toBe(1); // 2^1 = 2
    expect(hilbertOrder(3, 2)).toBe(2); // 2^2 = 4 >= 3
    expect(hilbertOrder(4, 4)).toBe(2); // 2^2 = 4
    expect(hilbertOrder(5, 3)).toBe(3); // 2^3 = 8 >= 5
    expect(hilbertOrder(600, 400)).toBe(10); // 2^10 = 1024 >= 600
  });

  it('is driven by the larger of width/height', () => {
    expect(hilbertOrder(600, 400)).toBe(hilbertOrder(400, 600));
  });
});

describe('hilbertD2XY', () => {
  it('order 0 always returns (0,0)', () => {
    expect(hilbertD2XY(0, 0)).toEqual([0, 0]);
  });

  it('order 1 visits all 4 cells of a 2x2 grid exactly once', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 4; d++) {
      const [x, y] = hilbertD2XY(1, d);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(2);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(4);
  });

  it('visits every cell of a 2^order x 2^order grid exactly once (order 3)', () => {
    const order = 3;
    const n = 1 << order;
    const total = n * n;
    const seen = new Set<string>();
    for (let d = 0; d < total; d++) {
      const [x, y] = hilbertD2XY(order, d);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(n);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(total);
  });

  it('consecutive points are always 4-adjacent (Manhattan distance 1)', () => {
    const order = 4;
    const n = 1 << order;
    const total = n * n;
    let prev = hilbertD2XY(order, 0);
    for (let d = 1; d < total; d++) {
      const cur = hilbertD2XY(order, d);
      const manhattan = Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
      expect(manhattan).toBe(1);
      prev = cur;
    }
  });

  it('is deterministic across repeated calls', () => {
    expect(hilbertD2XY(3, 17)).toEqual(hilbertD2XY(3, 17));
  });
});
