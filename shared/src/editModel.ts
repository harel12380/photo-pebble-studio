/**
 * editModel.ts — the per-photo, non-destructive edit model.
 *
 * These types are part of the studio's persisted state (they are written into
 * the re-import manifest), so they live in `shared`. Human-readable labels and
 * descriptions are intentionally NOT here — the UI resolves those from i18n,
 * keyed by the ids below, so the app can be fully Hebrew/English.
 */

import type { RGB } from "./cardFormat";

/**
 * Dithering algorithms, grouped into families that share configuration:
 *  - "diffusion": error-diffusion kernels (strength + serpentine scan).
 *  - "ordered":   threshold-map dithering (matrix type + amount).
 *  - "pattern":   Yliluoma positional palette mixing (no extra knobs).
 *  - "curve":     Riemersma / Hilbert-curve diffusion (strength).
 *  - "none":      nearest color, no dithering.
 */
export type DitherAlgorithm =
  | "floyd-steinberg"
  | "stucki"
  | "jarvis-judice-ninke"
  | "burkes"
  | "sierra"
  | "sierra-two-row"
  | "sierra-lite"
  | "atkinson"
  | "fan"
  | "shiau-fan"
  | "shiau-fan-2"
  | "stevenson-arce"
  | "riemersma"
  | "ordered"
  | "yliluoma"
  | "nearest";

export type DitherFamily = "diffusion" | "ordered" | "pattern" | "curve" | "none";

/**
 * Algorithm registry: id + family + display order. Labels live in i18n.
 *
 * This is intentionally a *curated* shortlist, not every kernel the engine can
 * run. The full `DitherAlgorithm` union and `DIFFUSION_KERNELS` still carry the
 * legacy variants (sierra/fan/burkes/jjn/…) so projects saved with them keep
 * rendering after re-import — but they are no longer offered in the UI. Those
 * extra kernels were near-duplicates of the ones below and only added noise to
 * the picker. The seven here each give a *distinct*, genuinely-good result:
 *   - floyd-steinberg: sharp, detailed, the safe all-rounder.
 *   - stucki:          smoothest gradients with crisp edges — best for photos.
 *   - atkinson:        punchy, high-contrast, clean flats (classic Mac look).
 *   - riemersma:       organic space-filling-curve diffusion, no directional worms.
 *   - ordered:         stateless threshold map (blue-noise = fine film grain).
 *   - yliluoma:        positional palette mixing — the richest color.
 *   - nearest:         no dithering (hard posterize), for graphics/logos.
 */
export const DITHER_ALGORITHMS: readonly {
  id: DitherAlgorithm;
  family: DitherFamily;
}[] = [
  { id: "floyd-steinberg", family: "diffusion" },
  { id: "stucki", family: "diffusion" },
  { id: "atkinson", family: "diffusion" },
  { id: "riemersma", family: "curve" },
  { id: "ordered", family: "ordered" },
  { id: "yliluoma", family: "pattern" },
  { id: "nearest", family: "none" },
];

const FAMILY_BY_ID = new Map(DITHER_ALGORITHMS.map((a) => [a.id, a.family] as const));

export function ditherFamily(a: DitherAlgorithm): DitherFamily {
  return FAMILY_BY_ID.get(a) ?? "diffusion";
}

/** Threshold matrices for the "ordered" family (labels live in i18n). */
export type OrderedMatrix = "bayer2" | "bayer4" | "bayer8" | "cluster4" | "blue-noise";

export const ORDERED_MATRICES: readonly OrderedMatrix[] = [
  "blue-noise",
  "bayer8",
  "bayer4",
  "bayer2",
  "cluster4",
];

export type Rotation = 0 | 90 | 180 | 270;
export type CropMode = "fill" | "fit";

/** How empty space (fit-mode letterboxing / zoom-out) is filled. */
export type BackgroundType = "blur" | "color";

export interface BackgroundSetting {
  type: BackgroundType;
  /** Used when type === 'color'. */
  color: RGB;
}

export const DEFAULT_BACKGROUND: BackgroundSetting = {
  type: "blur",
  color: [255, 255, 255],
};

/** All per-photo, non-destructive edit parameters. */
export interface EditState {
  rotation: Rotation;
  cropMode: CropMode;
  /** Zoom factor. 1 = base (cover for fill, contain for fit). */
  zoom: number;
  /** Normalized pan, -1..1, only meaningful when content overflows the frame. */
  offsetX: number;
  offsetY: number;
  /** -100..100, 0 = no change. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** White balance, -100..100, 0 = neutral. Temperature is the blue↔yellow
   *  (cool↔warm) axis, tint the green↔magenta axis. Corrects a color cast so a
   *  scene lit by e.g. blue LEDs doesn't quantize skin/whites to the blue
   *  palette entry. See pipeline/whiteBalance.ts. */
  temperature: number;
  tint: number;
  /** Unsharp-mask amount, 0..100. Restores edge crispness lost to dithering. */
  sharpness: number;
  algorithm: DitherAlgorithm;
  /** Error-diffusion amount / ordered-dither contrast, 0..100. */
  ditherStrength: number;
  /** Error-diffusion only: alternate scan direction each row. */
  serpentine: boolean;
  /** Ordered family only: which threshold matrix to use. */
  orderedMatrix: OrderedMatrix;
  /** Fill for empty space when the photo doesn't cover the frame. */
  background: BackgroundSetting;
}

/** Default error-diffusion / ordered amount for new photos (0..100). */
export const DEFAULT_DITHER_STRENGTH = 100;

/**
 * Recommended e-ink adjustment defaults applied to every new photo. The panel
 * is dim and low-contrast (~30:1, ~34% white reflectance), so a mild lift makes
 * the displayed result look closer to the source.
 */
export const DEFAULT_ADJUSTMENTS = {
  brightness: 8,
  contrast: 20,
  saturation: 30,
  sharpness: 50,
} as const;

/** Global, persisted defaults that seed new photos and the "all photos" controls. */
export interface EditDefaults {
  algorithm: DitherAlgorithm;
  ditherStrength: number;
  serpentine: boolean;
  orderedMatrix: OrderedMatrix;
  cropMode: CropMode;
  background: BackgroundSetting;
}

export const DEFAULT_EDIT_DEFAULTS: EditDefaults = {
  algorithm: "floyd-steinberg",
  ditherStrength: DEFAULT_DITHER_STRENGTH,
  serpentine: true,
  orderedMatrix: "blue-noise",
  cropMode: "fill",
  background: DEFAULT_BACKGROUND,
};

export function defaultEditState(d: EditDefaults = DEFAULT_EDIT_DEFAULTS): EditState {
  return {
    rotation: 0,
    cropMode: d.cropMode,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    brightness: DEFAULT_ADJUSTMENTS.brightness,
    contrast: DEFAULT_ADJUSTMENTS.contrast,
    saturation: DEFAULT_ADJUSTMENTS.saturation,
    temperature: 0,
    tint: 0,
    sharpness: DEFAULT_ADJUSTMENTS.sharpness,
    algorithm: d.algorithm,
    ditherStrength: d.ditherStrength,
    serpentine: d.serpentine,
    orderedMatrix: d.orderedMatrix,
    background: { type: d.background.type, color: d.background.color },
  };
}

/** Fill any missing fields on a (possibly older / persisted) partial edit. */
export function normalizeEdit(
  partial: Partial<EditState> | undefined,
  d: EditDefaults = DEFAULT_EDIT_DEFAULTS,
): EditState {
  return { ...defaultEditState(d), ...(partial ?? {}) };
}

/**
 * Default OKLab chroma weight ("colorfulness"). Higher = cleaner neutrals but
 * duller; lower = more colorful but more speckle. Below ~4.2 even pure mid-grays
 * snap to the lowest-chroma palette color (green), casting neutrals — so the
 * default sits safely above that knee. ~2.1–6.0 is the useful range.
 */
export const DEFAULT_CHROMA_WEIGHT = 4.5;

/** How the photo list is ordered (labels live in i18n). */
export type SortMode =
  | "manual"
  | "taken-desc"
  | "taken-asc"
  | "modified-desc"
  | "modified-asc"
  | "name-asc";

export const SORT_MODES: readonly SortMode[] = [
  "taken-desc",
  "taken-asc",
  "modified-desc",
  "modified-asc",
  "name-asc",
  "manual",
];

/** Default sort: newest captures first (by EXIF date taken). */
export const DEFAULT_SORT_MODE: SortMode = "taken-desc";

/** Where an item came from. "message" is a generated text card. */
export type ImageSourceKind = "file" | "clipboard" | "message";
