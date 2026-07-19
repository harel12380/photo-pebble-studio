/**
 * cardFormat.ts — THE SINGLE SOURCE OF TRUTH for the on-card contract.
 *
 * This module defines the format the studio writes onto the SD card. The device
 * reads the same contract, so any change here must stay in step with it.
 * Everything the two sides agree on lives here:
 *
 *   - the panel resolution and orientation,
 *   - the 6 Spectra-6 colors (target RGB for dithering + on-wire nibble code),
 *   - the `indexed4` binary image format (magic header + packing),
 *   - the `config.json` schema.
 *
 * Verified against the Waveshare "4inch e-Paper HAT+ (E)" Spectra-6 driver
 * (EPD_4in0e).
 */

/* ------------------------------------------------------------------ *
 * Versioning
 * ------------------------------------------------------------------ */

/** Bump when the on-card contract changes in a backwards-incompatible way. */
export const CARD_FORMAT_VERSION = 1 as const;

/* ------------------------------------------------------------------ *
 * Panel geometry
 * ------------------------------------------------------------------ *
 *
 * The Waveshare 4" Spectra-6 (E6) driver framebuffer is natively 400 (W) x 600
 * (H) — i.e. PORTRAIT — even though the product is most often mounted as
 * 600 x 400 (LANDSCAPE). The firmware decides how it maps our buffer onto the
 * panel; the .bin header is self-describing (it carries width/height), so either
 * orientation works as long as firmware honors the header.
 */

/** Native driver framebuffer dimensions (portrait), from EPD_4in0e.h. */
export const PANEL_NATIVE = {
  width: 400,
  height: 600,
} as const;

export type Orientation = "landscape" | "portrait";

/** Default orientation the app presents (most photo frames are landscape). */
export const DEFAULT_ORIENTATION: Orientation = "landscape";

/** Resolution of the exported image for a given orientation. */
export function displaySize(orientation: Orientation): {
  width: number;
  height: number;
} {
  const short = Math.min(PANEL_NATIVE.width, PANEL_NATIVE.height); // 400
  const long = Math.max(PANEL_NATIVE.width, PANEL_NATIVE.height); // 600
  return orientation === "landscape"
    ? { width: long, height: short } // 600 x 400
    : { width: short, height: long }; // 400 x 600
}

/* ------------------------------------------------------------------ *
 * The Spectra-6 palette
 * ------------------------------------------------------------------ *
 *
 * A fixed property of the panel, NOT user-configurable. The 4" E6 is a 6-color
 * panel with "Grey Scale 2" (each primary is fully on or off). Both halves of
 * each entry are hard-coded:
 *
 *   - `code` is the 4-bit value written to the .bin = the panel's native color
 *     index, sent verbatim over SPI by the EPD_4in0e driver (no LUT/remap):
 *
 *       BLACK 0x0  WHITE 0x1  YELLOW 0x2  RED 0x3  BLUE 0x5  GREEN 0x6
 *       (0x4 is skipped; 0x7 is unused)
 *
 *   - `rgb` is the sRGB target the ditherer matches against; `preview` is the
 *     muted, measured on-panel color used for an honest on-screen preview.
 */

export type RGB = readonly [number, number, number];

export type PaletteColorId =
  | "black"
  | "white"
  | "yellow"
  | "red"
  | "blue"
  | "green";

export interface PaletteColor {
  readonly id: PaletteColorId;
  readonly label: string;
  /** sRGB target the ditherer matches against. */
  readonly rgb: RGB;
  /** sRGB the on-screen preview renders (muted, measured on-panel colors). */
  readonly preview: RGB;
  /** On-wire nibble code (0-15) the panel expects. Fixed by the hardware. */
  readonly code: number;
}

/**
 * The hard-coded Spectra-6 palette for the Waveshare 4" e-Paper HAT+ (E).
 * Frozen so nothing in the app can mutate it. The array index is the palette
 * index used internally by the ditherer.
 */
export const PALETTE: readonly PaletteColor[] = Object.freeze([
  { id: "black", label: "Black", rgb: [0, 0, 0], preview: [0, 0, 0], code: 0x0 },
  { id: "white", label: "White", rgb: [255, 255, 255], preview: [208, 210, 210], code: 0x1 },
  { id: "yellow", label: "Yellow", rgb: [232, 224, 0], preview: [208, 190, 71], code: 0x2 },
  { id: "red", label: "Red", rgb: [200, 40, 40], preview: [156, 72, 75], code: 0x3 },
  { id: "blue", label: "Blue", rgb: [40, 60, 180], preview: [61, 59, 94], code: 0x5 },
  { id: "green", label: "Green", rgb: [40, 120, 70], preview: [58, 91, 70], code: 0x6 },
] as const);

/** RGB the ditherer matches against (fast path for the worker). */
export const PALETTE_RGB: readonly RGB[] = PALETTE.map((c) => c.rgb);

/** RGB used for the honest on-screen preview (muted, measured on-panel colors). */
export const PREVIEW_RGB: readonly RGB[] = PALETTE.map((c) => c.preview);

/** Color used for "empty"/background areas (fit-mode letterboxing, alpha). */
export const BACKGROUND_RGB: RGB =
  PALETTE.find((c) => c.id === "white")?.rgb ?? [255, 255, 255];

/** Palette index for a given color id (e.g. used by the message renderer). */
export function paletteIndex(id: PaletteColorId): number {
  return PALETTE.findIndex((c) => c.id === id);
}

/** Look up a palette color by id. */
export function paletteColor(id: PaletteColorId): PaletteColor {
  const c = PALETTE.find((p) => p.id === id);
  if (!c) throw new Error(`Unknown palette color: ${id}`);
  return c;
}

/* ------------------------------------------------------------------ *
 * indexed4 binary image format ("PBL1")
 * ------------------------------------------------------------------ *
 *
 *   Bytes 0-3 : magic ASCII "PBL1"
 *   Bytes 4-5 : width  (uint16, little-endian)
 *   Bytes 6-7 : height (uint16, little-endian)
 *   Bytes 8.. : packed pixels, 2 pixels per byte, HIGH nibble = first (left)
 *               pixel. Each nibble is a panel native color code (see palette).
 *
 * Pixels are row-major and packed CONTINUOUSLY as one stream of width*height
 * nibbles — no per-row padding. Identical to the native Waveshare framebuffer
 * layout, so firmware reads the body almost as a memcpy.
 */

export const MAGIC = "PBL1" as const;
export const MAGIC_BYTES: readonly number[] = [0x50, 0x42, 0x4c, 0x31]; // "PBL1"
export const HEADER_BYTES = 8;

/** Header size + packed pixel size for an image of the given dimensions. */
export function indexed4ByteLength(width: number, height: number): number {
  return HEADER_BYTES + Math.ceil((width * height) / 2);
}

export type ImageFileFormat = "indexed4" | "bmp";

/** File extension for each output format. */
export function fileExtension(format: ImageFileFormat): string {
  return format === "indexed4" ? "bin" : "bmp";
}

/* ------------------------------------------------------------------ *
 * config.json schema (what the firmware reads)
 * ------------------------------------------------------------------ */

/** A daily quiet window (local time, "HH:MM") during which the frame sleeps
 *  and does not auto-advance — saves battery and avoids pointless night
 *  refreshes. `null` disables the quiet window. */
export interface QuietHours {
  start: string;
  end: string;
}

export interface CardConfigDisplay {
  width: number;
  height: number;
  /** "indexed4" for product .bin exports; "bmp" only for debug exports (the
   *  firmware cannot display BMP cards — the field must tell the truth so a
   *  debug card is identifiable instead of masquerading as a product card). */
  format: ImageFileFormat;
}

/**
 * Slideshow settings. There is deliberately NO order setting: photos always
 * play as an endless random shuffle (a persisted Fisher–Yates walk on the
 * frame — no photo repeats until every photo has been shown, then a fresh
 * shuffle starts). `loop: false` parks the frame after one full shuffle cycle.
 */
export interface CardConfigSlideshow {
  /** Seconds between automatic advances. 0 = no timed advance (buttons only). */
  interval_seconds: number;
  loop: boolean;
  /** Optional daily quiet window; omitted/null means "always on". */
  quiet_hours?: QuietHours | null;
}

export interface CardConfigPhoto {
  /** Path relative to card root, e.g. "photos/000.bin". */
  file: string;
  /** Original filename, for reference / debugging. */
  name: string;
}

export interface CardConfig {
  version: typeof CARD_FORMAT_VERSION;
  display: CardConfigDisplay;
  slideshow: CardConfigSlideshow;
  /**
   * Random per-export identity (uint32, never 0). The firmware remembers the
   * last card_id it played (pebble.state `card=` field); a mismatch means "new
   * card data" — it restarts the shuffle and, when `intro_index` is present,
   * shows that photo first.
   */
  card_id: number;
  /**
   * Index (into `photos`) of the item to show FIRST after new card data is
   * inserted — typically a message card marked "show first" in the studio.
   * Omitted when nothing is pinned.
   */
  intro_index?: number;
  photos: CardConfigPhoto[];
}

/**
 * Assemble a CardConfig. KEY ORDER IS CONTRACTUAL, not cosmetic: the firmware
 * reads config.json with a tolerant strstr scanner over the first 4 KB, so
 * `slideshow` (interval_seconds / loop / quiet_hours) and `card_id` /
 * `intro_index` MUST serialize before the `photos` array — a photo name
 * containing a key word would otherwise satisfy the firmware's loose scan, and
 * with many photos these keys would fall outside the firmware's read window.
 * The slideshow object is rebuilt field-by-field so stray keys from older
 * persisted state can never leak into the firmware-facing JSON.
 * All studio config serialization must go through this function; it is pinned
 * by cardFormat.test.ts against an emulation of the firmware parser.
 */
export function buildCardConfig(
  display: CardConfigDisplay,
  slideshow: CardConfigSlideshow,
  photos: CardConfigPhoto[],
  cardId: number,
  introIndex?: number,
): CardConfig {
  const clean: CardConfigSlideshow = {
    interval_seconds: slideshow.interval_seconds,
    loop: slideshow.loop,
  };
  if (slideshow.quiet_hours !== undefined) {
    clean.quiet_hours = slideshow.quiet_hours
      ? { start: slideshow.quiet_hours.start, end: slideshow.quiet_hours.end }
      : null;
  }
  const introOk =
    introIndex !== undefined && introIndex >= 0 && introIndex < photos.length;
  // intro_index is spread in BEFORE `photos` so its JSON key stays inside the
  // firmware's 4 KB scan window regardless of photo count.
  return {
    version: CARD_FORMAT_VERSION,
    display,
    slideshow: clean,
    card_id: toCardId(cardId),
    ...(introOk ? { intro_index: introIndex } : {}),
    photos: [...photos],
  };
}

/** Clamp/normalise a card id to a non-zero uint32 (0 is the firmware's
 *  "no card id" sentinel, so a 0 draw is nudged to 1). */
export function toCardId(n: number): number {
  const v = n >>> 0;
  return v === 0 ? 1 : v;
}

/** Draw a fresh random card id (non-zero uint32). */
export function freshCardId(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return toCardId(buf[0]);
  }
  return toCardId(Math.floor(Math.random() * 0xffffffff));
}

/* ------------------------------------------------------------------ *
 * On-card paths
 * ------------------------------------------------------------------ */

export const CONFIG_FILENAME = "config.json";
export const PHOTOS_DIR = "photos";

/** One-shot wall-clock hand-off the firmware reads, applies to the DS3231, then
 *  deletes (see firmware maybe_apply_clock_file).  Written only by the explicit
 *  "Set frame clock" action (see syncClockToDirectory), never bundled into a
 *  routine photo export — re-stamping every card swap would reset an
 *  already-correct clock backward. */
export const CLOCK_FILENAME = "clock.txt";

/** Format a Date as the firmware-expected "YYYY-MM-DD HH:MM:SS" in LOCAL time. */
export function formatClockStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * FIRMWARE-OWNED resume state, written by the frame after every advance so the
 * slideshow position survives a full power loss (battery swap / unplug):
 *
 *   `<STATE_MAGIC> index=<n> seed=<8-hex> pos=<n> count=<n> shown=<n> of=<n> card=<8-hex>\n`
 *
 *   - index : photo index currently on the panel
 *   - seed  : random-mode shuffle seed (0 = no shuffle in progress)
 *   - pos   : position within the shuffled order
 *   - count : photo count the shuffle was built for (invalidates on card change)
 *   - shown : photo index physically on the e-paper glass (which retains its
 *             image unpowered); 4294967295 = not a photo (error screen /
 *             unknown).  Lets a cold boot skip re-rendering an image that is
 *             already displayed.
 *   - of    : photo count when `shown` was rendered (a re-export that changes
 *             the count forces a real render).  shown/of are optional: older
 *             4-field files parse fine and simply never skip.
 *   - card  : the config.json `card_id` last played (hex).  A mismatch on boot
 *             means new card data: the firmware restarts the shuffle and shows
 *             the `intro_index` photo first (when present).  Optional: older
 *             files parse fine and simply treat the next boot as new data.
 *
 * The studio must NEVER write, rewrite, or delete this file: exports leave it
 * in place (a changed photo count invalidates the stale parts on the frame
 * itself), and imports ignore it.
 */
export const STATE_FILENAME = "pebble.state";

/** First token of a pebble.state line; bump when the state schema changes. */
export const STATE_MAGIC = "PBLS1";

/** Zero-padded photo basename for a given index, e.g. 0 -> "000". */
export function photoBasename(index: number): string {
  return String(index).padStart(3, "0");
}

/** Card-relative path for the Nth photo, e.g. "photos/000.bin". */
export function photoPath(index: number, format: ImageFileFormat): string {
  return `${PHOTOS_DIR}/${photoBasename(index)}.${fileExtension(format)}`;
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

/** Sentinel: a timed interval of 0 means "advance only on button press". */
export const AUTO_ADVANCE_OFF = 0 as const;

/**
 * Maximum photos per card. The firmware stops enumerating photos/ at this
 * count (fixed-size name table), so the studio must refuse to export more —
 * otherwise the overflow photos would sit on the card but never display.
 * Also keeps basenames at 3 digits, which the firmware's lexicographic sort
 * relies on ("1000.bin" would sort before "999.bin").
 */
export const MAX_PHOTOS = 512;

/** Default quiet window: sleep overnight to preserve battery. */
export const DEFAULT_QUIET_HOURS: QuietHours = { start: "23:00", end: "07:00" };

/**
 * Default slideshow. A multi-hour interval is chosen deliberately: each E6
 * refresh takes ~30 s and is the dominant power cost, so a long interval is what
 * makes battery life measured in months rather than weeks. Users can shorten it
 * (down the menu to 30 min) or turn timed advance off entirely.
 */
export const DEFAULT_SLIDESHOW: CardConfigSlideshow = {
  interval_seconds: 14400, // 4 hours
  loop: true,
  quiet_hours: DEFAULT_QUIET_HOURS,
};

/** Interval presets offered in the studio (seconds). */
export const INTERVAL_PRESETS: readonly number[] = [
  1800, // 30 min
  3600, // 1 hour
  14400, // 4 hours
  43200, // 12 hours
  86400, // daily
  AUTO_ADVANCE_OFF, // off (buttons only)
];
