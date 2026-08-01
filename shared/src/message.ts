/**
 * message.ts — "messages": text the user writes (usually in Hebrew) that the
 * studio renders to an image and treats like any other photo on the card.
 *
 * A MessageSpec is layout-agnostic about the rendering engine; the studio's
 * message renderer turns it into panel-resolution pixels, which then go through
 * the same dithering pipeline as a photo. The spec is stored in the manifest so
 * a message stays fully editable after a card round-trip.
 */

import type { PaletteColorId } from "./cardFormat";

/** Logical horizontal alignment (RTL-aware: "start" = right in Hebrew). */
export type TextAlign = "start" | "center" | "end";
export type VerticalAlign = "top" | "middle" | "bottom";
export type TextDirection = "rtl" | "ltr";

/** Ids of the bundled fonts; the studio maps these to actual font files. */
export type FontId =
  | "heebo"
  | "rubik"
  | "assistant"
  | "frank-ruhl-libre"
  | "secular-one"
  | "suez-one";

export const FONT_IDS: readonly FontId[] = [
  "heebo",
  "rubik",
  "assistant",
  "frank-ruhl-libre",
  "secular-one",
  "suez-one",
];

/**
 * How a message relates to the frame:
 *  - "card":    a standalone text card (no photo).
 *  - "band":    a photo fills part of the frame; a solid text band sits on the
 *               remaining strip along any one edge (top/bottom/left/right).
 *  - "overlay": text drawn directly on top of the photo (optional scrim).
 */
export type MessageLayout = "card" | "band" | "overlay";

/**
 * When the frame shows this message:
 *  - "random": part of the normal endless random rotation, like any photo.
 *  - "intro":  shown FIRST the next time the frame boots with new card data
 *              (fresh export inserted), and HELD there — the interval is
 *              paused, so a message meant to be read cannot scroll away on
 *              its own. The first Prev/Next press releases the hold and the
 *              item joins the random rotation from then on. At most one item
 *              per card is the intro — the studio enforces this and exports
 *              it as config.json `intro_index`.
 */
export type MessagePlacement = "random" | "intro";

export interface MessageBand {
  edge: "top" | "bottom" | "left" | "right";
  /** Band thickness as a fraction of the frame's short axis, 0..1. */
  sizePct: number;
}

export interface MessageOverlay {
  position: "top" | "center" | "bottom";
  /** Darken behind the text for legibility over busy photos. */
  scrim: boolean;
}

export interface MessageSpec {
  /** The text. May contain newlines; rendered respecting `direction`. */
  text: string;
  fontId: FontId;
  /** Font size as a fraction of the frame's short axis (0..1), so it scales
   *  with orientation. ~0.12 is a comfortable headline. */
  fontScale: number;
  fontWeight: number;
  /** Both colors are chosen from the fixed 6-color panel palette. */
  textColor: PaletteColorId;
  backgroundColor: PaletteColorId;
  align: TextAlign;
  vAlign: VerticalAlign;
  direction: TextDirection;
  /** Line height multiplier (1.0 = font size). */
  lineSpacing: number;
  /** Inner margin as a fraction of the frame's short axis, 0..1. */
  paddingPct: number;
  layout: MessageLayout;
  /** Present when layout === "band". */
  band?: MessageBand;
  /** Present when layout === "overlay". */
  overlay?: MessageOverlay;
  /** When the frame shows this message; missing = "random" (older projects). */
  placement?: MessagePlacement;
}

export const DEFAULT_MESSAGE: MessageSpec = {
  text: "",
  fontId: "heebo",
  fontScale: 0.14,
  fontWeight: 700,
  textColor: "black",
  backgroundColor: "white",
  align: "center",
  vAlign: "middle",
  direction: "rtl",
  lineSpacing: 1.2,
  paddingPct: 0.08,
  layout: "card",
};

export function defaultMessage(partial?: Partial<MessageSpec>): MessageSpec {
  return { ...DEFAULT_MESSAGE, ...(partial ?? {}) };
}

/**
 * First-strong-character direction detection (a tiny subset of the Unicode
 * Bidi P2/P3 rule): scan the text and return the direction implied by the first
 * strongly-directional character, ignoring digits, punctuation, whitespace and
 * symbols. Returns `undefined` when the text carries no directional signal
 * (empty, or only neutrals like "123 :)") so callers can keep the current
 * choice rather than flip-flopping on weak input.
 *
 * Covers the RTL blocks the app's bundled fonts target — Hebrew (U+0590–05FF,
 * incl. presentation forms U+FB1D–FB4F) and Arabic (U+0600–06FF, U+0750–077F,
 * U+08A0–08FF, presentation forms U+FB50–FDFF and U+FE70–FEFF) — and treats the
 * Basic-Latin / Latin-1 letter ranges as LTR. Anything else (other strong-LTR
 * scripts) also reads as LTR, which is the right default for this 2-direction
 * UI.
 */
export function detectDirection(text: string): TextDirection | undefined {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const rtl =
      (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
      (cp >= 0xfb1d && cp <= 0xfb4f) || // Hebrew presentation forms
      (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
      (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
      (cp >= 0x08a0 && cp <= 0x08ff) || // Arabic Extended-A
      (cp >= 0xfb50 && cp <= 0xfdff) || // Arabic presentation forms-A
      (cp >= 0xfe70 && cp <= 0xfeff); // Arabic presentation forms-B
    if (rtl) return "rtl";
    const ltr =
      (cp >= 0x41 && cp <= 0x5a) || // A–Z
      (cp >= 0x61 && cp <= 0x7a) || // a–z
      (cp >= 0x00c0 && cp <= 0x024f); // Latin-1 Supplement + Latin Extended-A/B
    if (ltr) return "ltr";
  }
  return undefined;
}
