/**
 * Pure text-layout math for message rendering — no canvas, no DOM, so it is
 * fully unit-testable. The renderer (./render) supplies a real text-measuring
 * function; here we only decide where things go.
 */
import type { TextAlign, TextDirection, VerticalAlign } from "../types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Resolve a logical alignment to a physical side, honoring writing direction. */
export function resolveAlign(
  align: TextAlign,
  direction: TextDirection,
): "left" | "center" | "right" {
  if (align === "center") return "center";
  const start = direction === "rtl" ? "right" : "left";
  const end = direction === "rtl" ? "left" : "right";
  return align === "start" ? start : end;
}

/** X anchor (in px) for a resolved physical alignment within [left, right]. */
export function anchorX(
  resolved: "left" | "center" | "right",
  left: number,
  right: number,
  pad: number,
): number {
  if (resolved === "center") return (left + right) / 2;
  if (resolved === "right") return right - pad;
  return left + pad;
}

/**
 * Break a single word that is wider than `maxWidth` into character-level chunks
 * that each fit. Iterates by code point so surrogate pairs (emoji) stay intact.
 * A lone character wider than maxWidth is emitted as-is (nothing else to do).
 */
function breakWord(
  word: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  if (maxWidth <= 0 || measure(word) <= maxWidth) return [word];
  const pieces: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur !== "" && measure(cur + ch) > maxWidth) {
      pieces.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur !== "") pieces.push(cur);
  return pieces;
}

/**
 * Word-wrap `text` to `maxWidth`, preserving explicit newlines. `measure`
 * returns the rendered width of a string. A single word wider than maxWidth is
 * broken at the character level so it never spills past the edge of the (small)
 * frame and gets clipped — on an e-ink photo frame a hard break is far better
 * than text running off the display. See breakWord().
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (maxWidth <= 0 || measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      // `candidate` overflows: flush the current line, then place `word` on a
      // fresh line, breaking it across lines if the word itself is too wide.
      if (line !== "") out.push(line);
      const pieces = breakWord(word, maxWidth, measure);
      for (let k = 0; k < pieces.length - 1; k++) out.push(pieces[k]);
      line = pieces[pieces.length - 1];
    }
    out.push(line);
  }
  return out;
}

/** Top y of a text block of height `blockH` placed vertically in an area. */
export function blockTop(
  vAlign: VerticalAlign,
  areaTop: number,
  areaH: number,
  blockH: number,
): number {
  if (vAlign === "top") return areaTop;
  if (vAlign === "bottom") return areaTop + areaH - blockH;
  return areaTop + (areaH - blockH) / 2;
}

/**
 * Baseline-middle y for each line, given the block's top and per-line height.
 * (Canvas textBaseline is "middle", so a line sits at top + i*lineH + lineH/2.)
 */
export function lineCenters(top: number, lineH: number, count: number): number[] {
  const ys: number[] = [];
  for (let i = 0; i < count; i++) ys.push(top + i * lineH + lineH / 2);
  return ys;
}

/**
 * Split the frame into the photo area and the solid text band for the "band"
 * layout. The band hugs one edge; its thickness is `sizePct` (clamped 0..1) of
 * the frame's short axis. Top/bottom give horizontal bands, left/right give
 * vertical bands, with the photo filling the remainder.
 */
export function bandGeometry(
  edge: "top" | "bottom" | "left" | "right",
  sizePct: number,
  width: number,
  height: number,
): { band: Rect; image: Rect } {
  const short = Math.min(width, height);
  const thickness = Math.round(Math.max(0, Math.min(1, sizePct)) * short);
  switch (edge) {
    case "top":
      return {
        band: { x: 0, y: 0, w: width, h: thickness },
        image: { x: 0, y: thickness, w: width, h: height - thickness },
      };
    case "bottom":
      return {
        band: { x: 0, y: height - thickness, w: width, h: thickness },
        image: { x: 0, y: 0, w: width, h: height - thickness },
      };
    case "left":
      return {
        band: { x: 0, y: 0, w: thickness, h: height },
        image: { x: thickness, y: 0, w: width - thickness, h: height },
      };
    case "right":
      return {
        band: { x: width - thickness, y: 0, w: thickness, h: height },
        image: { x: 0, y: 0, w: width - thickness, h: height },
      };
  }
}

/**
 * Geometry for "cover" scaling of a source (sw×sh) into a destination rect:
 * the largest scale that fills the rect, centered (and clipped by the caller).
 */
export function coverRect(
  sw: number,
  sh: number,
  dest: Rect,
): { dx: number; dy: number; dw: number; dh: number } {
  if (sw <= 0 || sh <= 0) return { dx: dest.x, dy: dest.y, dw: dest.w, dh: dest.h };
  const scale = Math.max(dest.w / sw, dest.h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  return {
    dx: dest.x + (dest.w - dw) / 2,
    dy: dest.y + (dest.h - dh) / 2,
    dw,
    dh,
  };
}

/** Vertical band (for the scrim) around an overlay text block of height blockH. */
export function overlayScrimRect(
  position: "top" | "center" | "bottom",
  width: number,
  height: number,
  blockH: number,
  pad: number,
): Rect {
  const top =
    position === "top"
      ? pad
      : position === "bottom"
        ? height - blockH - pad
        : (height - blockH) / 2;
  return { x: 0, y: top - pad / 2, w: width, h: blockH + pad };
}

/** Map an overlay position to the vertical alignment used for its text block. */
export function overlayVAlign(
  position: "top" | "center" | "bottom",
): VerticalAlign {
  return position === "top" ? "top" : position === "bottom" ? "bottom" : "middle";
}
