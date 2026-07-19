import { describe, it, expect } from "vitest";
import {
  saliencyEnergy,
  profileX,
  bestWindowCenter,
  offsetForCenter,
  bestCropOffset,
} from "./smartCrop";

/** Build an opaque RGBA buffer from a per-pixel gray value function. */
function grayRGBA(w: number, h: number, gray: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = gray(x, y);
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return data;
}

describe("saliencyEnergy", () => {
  it("is ~zero for a flat image", () => {
    const data = grayRGBA(8, 8, () => 128);
    const e = saliencyEnergy(data, 8, 8);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5);
  });

  it("lights up at a vertical edge", () => {
    // Left half black, right half white: one column of edge energy.
    const w = 8;
    const h = 4;
    const data = grayRGBA(w, h, (x) => (x < 4 ? 0 : 255));
    const e = saliencyEnergy(data, w, h);
    const prof = profileX(e, w, h);
    // The boundary sits between x=3 and x=4, so x=3 holds the strongest column.
    const peak = prof.indexOf(Math.max(...prof));
    expect(peak).toBe(3);
  });

  it("treats transparent pixels as flat (composited over white)", () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4); // all zero = transparent black
    const e = saliencyEnergy(data, w, h);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5);
  });
});

describe("offsetForCenter", () => {
  it("maps a centered window to no pan", () => {
    expect(offsetForCenter(0.5, 0.5)).toBeCloseTo(0, 6);
  });

  it("reveals the near edge at the extremes", () => {
    const f = 0.5;
    // center = f/2 -> window hugs the start -> offset +1
    expect(offsetForCenter(f / 2, f)).toBeCloseTo(1, 6);
    // center = 1 - f/2 -> window hugs the end -> offset -1
    expect(offsetForCenter(1 - f / 2, f)).toBeCloseTo(-1, 6);
  });

  it("returns 0 when the axis isn't cropped", () => {
    expect(offsetForCenter(0.2, 1)).toBe(0);
    expect(offsetForCenter(0.9, 1.5)).toBe(0);
  });

  it("clamps out-of-range centers", () => {
    expect(offsetForCenter(0, 0.5)).toBeCloseTo(1, 6);
    expect(offsetForCenter(1, 0.5)).toBeCloseTo(-1, 6);
  });
});

describe("bestWindowCenter", () => {
  it("centers on a flat profile (ties resolve to center)", () => {
    const prof = new Float32Array(10).fill(1);
    // fraction 0.4 -> window of 4 over 10 centers exactly at 0.5.
    expect(bestWindowCenter(prof, 0.4)).toBeCloseTo(0.5, 6);
  });

  it("slides toward a concentrated peak", () => {
    const prof = new Float32Array(10);
    prof[1] = 100; // energy lives near the start
    const c = bestWindowCenter(prof, 0.4);
    expect(c).toBeLessThan(0.5);
  });

  it("returns the center when nothing is croppable", () => {
    const prof = new Float32Array(10).fill(3);
    expect(bestWindowCenter(prof, 1)).toBe(0.5);
  });
});

describe("bestCropOffset", () => {
  it("pans toward an off-center subject and leaves the uncropped axis alone", () => {
    // A bright block on the left third of an otherwise flat, wide image.
    const w = 12;
    const h = 6;
    const data = grayRGBA(w, h, (x, y) => (x >= 2 && x <= 4 && y >= 2 && y <= 3 ? 255 : 0));
    // Horizontally cropped (only 50% visible), vertically fully shown.
    const { offsetX, offsetY } = bestCropOffset(data, w, h, 0.5, 1);
    expect(offsetX).toBeGreaterThan(0); // reveal the left side where the subject is
    expect(offsetY).toBe(0); // no vertical crop -> no vertical pan
  });

  it("stays centered on a symmetric image", () => {
    const w = 10;
    const h = 10;
    // Centered bright square -> energy symmetric about the middle.
    const data = grayRGBA(w, h, (x, y) =>
      x >= 4 && x <= 5 && y >= 4 && y <= 5 ? 255 : 0,
    );
    const { offsetX, offsetY } = bestCropOffset(data, w, h, 0.6, 0.6);
    expect(offsetX).toBeCloseTo(0, 1);
    expect(offsetY).toBeCloseTo(0, 1);
  });
});
