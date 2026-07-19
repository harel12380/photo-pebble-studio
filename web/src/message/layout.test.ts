import { describe, it, expect } from "vitest";
import {
  anchorX,
  bandGeometry,
  blockTop,
  coverRect,
  lineCenters,
  overlayScrimRect,
  overlayVAlign,
  resolveAlign,
  wrapText,
} from "./layout";

// Fake measurer: every character is 10px wide.
const measure = (s: string) => s.length * 10;

describe("resolveAlign", () => {
  it("maps start/end to physical sides by direction", () => {
    expect(resolveAlign("start", "rtl")).toBe("right");
    expect(resolveAlign("end", "rtl")).toBe("left");
    expect(resolveAlign("start", "ltr")).toBe("left");
    expect(resolveAlign("end", "ltr")).toBe("right");
    expect(resolveAlign("center", "rtl")).toBe("center");
  });
});

describe("anchorX", () => {
  it("places left/right at the padded edges and center in the middle", () => {
    expect(anchorX("left", 0, 100, 8)).toBe(8);
    expect(anchorX("right", 0, 100, 8)).toBe(92);
    expect(anchorX("center", 0, 100, 8)).toBe(50);
  });
});

describe("wrapText", () => {
  it("keeps explicit newlines as separate lines", () => {
    expect(wrapText("ab\ncd", 1000, measure)).toEqual(["ab", "cd"]);
  });

  it("wraps words to fit maxWidth (each char 10px)", () => {
    // "aaa bbb ccc" — maxWidth 70 fits "aaa bbb" (70) but not "+ ccc".
    expect(wrapText("aaa bbb ccc", 70, measure)).toEqual(["aaa bbb", "ccc"]);
  });

  it("breaks a single over-long word at the character level so it never overflows", () => {
    // maxWidth 50 fits 5 chars per line; 20-char word -> four 5-char chunks.
    expect(wrapText("supercalifragilistic", 50, measure)).toEqual([
      "super",
      "calif",
      "ragil",
      "istic",
    ]);
  });

  it("breaks an over-long word after wrapping the words that precede it", () => {
    // "aa" fits (20px); the long word can't join it, so flush "aa" then break.
    expect(wrapText("aa supercalif", 50, measure)).toEqual([
      "aa",
      "super",
      "calif",
    ]);
  });

  it("never breaks a word that fits on its own line", () => {
    expect(wrapText("aaa bbbbb ccc", 50, measure)).toEqual([
      "aaa",
      "bbbbb",
      "ccc",
    ]);
  });

  it("preserves a blank paragraph", () => {
    expect(wrapText("a\n\nb", 1000, measure)).toEqual(["a", "", "b"]);
  });
});

describe("blockTop", () => {
  it("aligns the block within the area", () => {
    expect(blockTop("top", 0, 100, 40)).toBe(0);
    expect(blockTop("bottom", 0, 100, 40)).toBe(60);
    expect(blockTop("middle", 0, 100, 40)).toBe(30);
    expect(blockTop("middle", 10, 100, 40)).toBe(40);
  });
});

describe("lineCenters", () => {
  it("returns baseline-middle y for each line", () => {
    expect(lineCenters(0, 20, 3)).toEqual([10, 30, 50]);
  });
});

describe("bandGeometry", () => {
  it("puts a bottom band below the image (landscape, short axis 400)", () => {
    const { band, image } = bandGeometry("bottom", 0.25, 600, 400);
    expect(band).toEqual({ x: 0, y: 300, w: 600, h: 100 });
    expect(image).toEqual({ x: 0, y: 0, w: 600, h: 300 });
  });

  it("puts a top band above the image and clamps sizePct", () => {
    const { band, image } = bandGeometry("top", 5, 600, 400); // clamped to 1.0
    expect(band).toEqual({ x: 0, y: 0, w: 600, h: 400 });
    expect(image).toEqual({ x: 0, y: 400, w: 600, h: 0 });
  });

  it("puts a left band beside the image, thickness off the short axis", () => {
    const { band, image } = bandGeometry("left", 0.25, 600, 400); // 0.25 * 400 = 100
    expect(band).toEqual({ x: 0, y: 0, w: 100, h: 400 });
    expect(image).toEqual({ x: 100, y: 0, w: 500, h: 400 });
  });

  it("puts a right band beside the image", () => {
    const { band, image } = bandGeometry("right", 0.25, 600, 400);
    expect(band).toEqual({ x: 500, y: 0, w: 100, h: 400 });
    expect(image).toEqual({ x: 0, y: 0, w: 500, h: 400 });
  });
});

describe("coverRect", () => {
  it("scales a wide source to fill a square, centered and overflowing x", () => {
    const r = coverRect(200, 100, { x: 0, y: 0, w: 100, h: 100 });
    expect(r.dh).toBe(100); // height fills
    expect(r.dw).toBe(200); // width overflows
    expect(r.dx).toBe(-50); // centered
    expect(r.dy).toBe(0);
  });
});

describe("overlay helpers", () => {
  it("maps overlay position to vertical alignment", () => {
    expect(overlayVAlign("top")).toBe("top");
    expect(overlayVAlign("center")).toBe("middle");
    expect(overlayVAlign("bottom")).toBe("bottom");
  });

  it("places the scrim band around the text block", () => {
    const r = overlayScrimRect("bottom", 600, 400, 80, 20);
    expect(r.w).toBe(600);
    expect(r.h).toBe(100); // blockH + pad
    expect(r.y).toBe(400 - 80 - 20 - 10); // height - blockH - pad - pad/2
  });
});
