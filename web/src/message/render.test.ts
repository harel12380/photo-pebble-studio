import { describe, it, expect } from "vitest";
import { drawMessage } from "./render";
import { defaultMessage } from "../types";

/**
 * Minimal fake 2D context that records fillRect calls and measures text at a
 * fixed glyph width. Enough to exercise drawMessage's geometry without a real
 * canvas (jsdom has no canvas backend in this suite). measureText returns
 * 10px/char regardless of font so wrapping is deterministic.
 */
function fakeCtx() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    fillStyle: "",
    font: "",
    direction: "ltr" as CanvasDirection,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    textAlign: "start" as CanvasTextAlign,
    measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics,
    fillText: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

describe("drawMessage overlay scrim", () => {
  it("sizes the scrim to the wrapped line count, not just explicit newlines", () => {
    const width = 600;
    const height = 400;
    // No "\n" but long enough to wrap to several lines at 10px/char.
    const text = "this is a long overlay caption with no manual line breaks at all";
    const spec = defaultMessage({
      text,
      layout: "overlay",
      fontScale: 0.05, // fontPx = 0.05 * 400 = 20
      lineSpacing: 1.2, // lineH = 24
      paddingPct: 0,
      overlay: { position: "bottom", scrim: true },
    });

    const { ctx, rects } = fakeCtx();
    drawMessage(ctx, spec, width, height);

    // rects[0] = background fill (no base image), rects[1] = scrim.
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const scrim = rects[1];

    // Compute how many lines the text actually wraps to (10px/char, maxWidth 600).
    const lineH = 0.05 * 400 * 1.2;
    const words = text.split(" ");
    let lines = 1;
    let cur = "";
    for (const w of words) {
      const cand = cur === "" ? w : `${cur} ${w}`;
      if (cand.length * 10 <= width) cur = cand;
      else {
        lines++;
        cur = w;
      }
    }
    expect(lines).toBeGreaterThan(1); // sanity: the caption really does wrap

    // Scrim height = blockH + pad (pad = 0 here) = lineH * lines. The old code
    // counted only "\n" (1 line) and would have produced a one-line-tall band.
    expect(scrim.h).toBeCloseTo(lineH * lines, 5);
    expect(scrim.h).toBeGreaterThan(lineH * 1.5); // definitively taller than one line
  });
});
