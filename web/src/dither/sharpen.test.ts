import { describe, it, expect } from 'vitest';
import { unsharpMask } from './sharpen';

/** Build a flat RGBA buffer of the given size, all pixels = [r,g,b,a]. */
function flatBuffer(width: number, height: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  return px;
}

describe('unsharpMask', () => {
  it('does nothing when amount <= 0', () => {
    const px = flatBuffer(2, 2, 100, 150, 200);
    const before = px.slice();
    unsharpMask(px, 2, 2, 0);
    expect(px).toEqual(before);
    unsharpMask(px, 2, 2, -1);
    expect(px).toEqual(before);
  });

  it('leaves a flat (constant-color) image unchanged regardless of amount', () => {
    const px = flatBuffer(4, 4, 100, 150, 200);
    const before = px.slice();
    unsharpMask(px, 4, 4, 0.5);
    expect(px).toEqual(before);
  });

  it('does not modify the alpha channel', () => {
    const px = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      px[i * 4] = (i * 17) % 256;
      px[i * 4 + 1] = (i * 31) % 256;
      px[i * 4 + 2] = (i * 53) % 256;
      px[i * 4 + 3] = 200; // not 255, to detect accidental writes
    }
    unsharpMask(px, 4, 4, 0.8);
    for (let i = 0; i < 16; i++) {
      expect(px[i * 4 + 3]).toBe(200);
    }
  });

  it('increases local contrast at an edge (sharpens) and stays in byte range', () => {
    // 1D step edge embedded in a 4x1 row: dark | dark | light | light
    const width = 4;
    const height = 1;
    const px = new Uint8ClampedArray(width * height * 4);
    const vals = [50, 50, 200, 200];
    for (let x = 0; x < width; x++) {
      px[x * 4] = vals[x];
      px[x * 4 + 1] = vals[x];
      px[x * 4 + 2] = vals[x];
      px[x * 4 + 3] = 255;
    }
    unsharpMask(px, width, height, 1.0);

    // All values remain valid bytes.
    for (let i = 0; i < px.length; i++) {
      expect(px[i]).toBeGreaterThanOrEqual(0);
      expect(px[i]).toBeLessThanOrEqual(255);
      expect(Number.isNaN(px[i])).toBe(false);
    }

    // The pixel just before the edge (index 1, value 50) should get darker
    // (overshoot below the original), and the pixel just after (index 2,
    // value 200) should get lighter (overshoot above the original) —
    // classic unsharp "halo" at a step edge.
    expect(px[1 * 4]).toBeLessThanOrEqual(50);
    expect(px[2 * 4]).toBeGreaterThanOrEqual(200);
  });

  it('produces a larger effect for a larger amount', () => {
    const width = 4;
    const height = 1;
    const make = (): Uint8ClampedArray => {
      const px = new Uint8ClampedArray(width * height * 4);
      const vals = [50, 50, 200, 200];
      for (let x = 0; x < width; x++) {
        px[x * 4] = vals[x];
        px[x * 4 + 1] = vals[x];
        px[x * 4 + 2] = vals[x];
        px[x * 4 + 3] = 255;
      }
      return px;
    };

    const small = make();
    const large = make();
    unsharpMask(small, width, height, 0.2);
    unsharpMask(large, width, height, 1.0);

    // Larger amount pushes pixel 1 (originally 50, going darker) further down.
    expect(large[1 * 4]).toBeLessThanOrEqual(small[1 * 4]);
  });
});
