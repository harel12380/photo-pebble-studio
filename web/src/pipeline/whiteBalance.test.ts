import { describe, it, expect } from 'vitest';
import {
  autoWhiteBalance,
  applyWhiteBalance,
  isNeutralWhiteBalance,
  whiteBalanceGains,
} from './whiteBalance';
import { defaultEditState, type EditState } from '../types';

function edit(patch: Partial<EditState> = {}): EditState {
  return { ...defaultEditState(), ...patch };
}

describe('whiteBalanceGains', () => {
  it('is a no-op at neutral', () => {
    expect(whiteBalanceGains(0, 0)).toEqual([1, 1, 1]);
  });

  it('warms by boosting red and cutting blue', () => {
    const [r, g, b] = whiteBalanceGains(50, 0);
    expect(r).toBeGreaterThan(1);
    expect(b).toBeLessThan(1);
    expect(g).toBeCloseTo(1, 5); // temperature leaves green alone
  });

  it('cools by cutting red and boosting blue', () => {
    const [r, , b] = whiteBalanceGains(-50, 0);
    expect(r).toBeLessThan(1);
    expect(b).toBeGreaterThan(1);
  });

  it('tint moves green against the red/blue average', () => {
    const [r, g, b] = whiteBalanceGains(0, 50); // magenta
    expect(g).toBeLessThan(1);
    expect(r).toBeGreaterThan(1);
    expect(b).toBeGreaterThan(1);
    expect(r).toBeCloseTo(b, 5); // symmetric on the temperature axis
  });

  it('preserves the level of a neutral gray (unit geometric mean)', () => {
    const [r, g, b] = whiteBalanceGains(40, -20);
    expect(r * g * b).toBeCloseTo(1, 5);
  });
});

describe('autoWhiteBalance', () => {
  it('leaves a neutral (gray-world) sample untouched', () => {
    expect(autoWhiteBalance(120, 120, 120)).toEqual({ temperature: 0, tint: 0 });
  });

  it('returns neutral for a degenerate black sample', () => {
    expect(autoWhiteBalance(0, 0, 0)).toEqual({ temperature: 0, tint: 0 });
  });

  it('warms a blue-cast scene (the blue-LED face case)', () => {
    // Mean of the reported problem photo: blue channel highest.
    const wb = autoWhiteBalance(59.5, 54.2, 84.6);
    expect(wb.temperature).toBeGreaterThan(0); // add warmth to cancel the cool cast
  });

  it('cools a warm (tungsten) cast', () => {
    const wb = autoWhiteBalance(140, 110, 70);
    expect(wb.temperature).toBeLessThan(0);
  });

  it('caps the tint axis far tighter than temperature', () => {
    // A wildly green-dominated sample should saturate tint at its small cap,
    // never spraying a big green correction.
    const wb = autoWhiteBalance(60, 200, 60);
    expect(Math.abs(wb.tint)).toBeLessThanOrEqual(12);
    expect(Math.abs(wb.temperature)).toBeLessThanOrEqual(70);
  });

  it('round-trips: applying the auto correction re-neutralizes the sample', () => {
    const r = 59.5;
    const g = 54.2;
    const b = 84.6;
    const wb = autoWhiteBalance(r, g, b);
    const [gr, , gb] = whiteBalanceGains(wb.temperature, wb.tint);
    // After correction the red/blue imbalance shrinks toward neutral.
    const before = Math.abs(Math.log(r) - Math.log(b));
    const after = Math.abs(Math.log(r * gr) - Math.log(b * gb));
    expect(after).toBeLessThan(before);
  });
});

describe('applyWhiteBalance', () => {
  it('does nothing when neutral', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255]);
    applyWhiteBalance(data, edit({ temperature: 0, tint: 0 }));
    expect(Array.from(data)).toEqual([100, 100, 100, 255]);
  });

  it('warms a bluish pixel toward neutral and leaves alpha alone', () => {
    const data = new Uint8ClampedArray([60, 60, 120, 200]);
    applyWhiteBalance(data, edit({ temperature: 50, tint: 0 }));
    expect(data[0]).toBeGreaterThan(60); // red up
    expect(data[2]).toBeLessThan(120); // blue down
    expect(data[3]).toBe(200); // alpha untouched
  });

  it('clamps without wrapping', () => {
    const data = new Uint8ClampedArray([250, 100, 10, 255]);
    applyWhiteBalance(data, edit({ temperature: 100, tint: 0 }));
    expect(data[0]).toBe(255);
  });
});

describe('isNeutralWhiteBalance', () => {
  it('is true only at 0/0', () => {
    expect(isNeutralWhiteBalance(edit({ temperature: 0, tint: 0 }))).toBe(true);
    expect(isNeutralWhiteBalance(edit({ temperature: 1, tint: 0 }))).toBe(false);
    expect(isNeutralWhiteBalance(edit({ temperature: 0, tint: -3 }))).toBe(false);
  });
});
