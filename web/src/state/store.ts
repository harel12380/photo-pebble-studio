import { createRoot, createEffect, createSignal } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import {
  DEFAULT_ORIENTATION,
  DEFAULT_SLIDESHOW,
  displaySize,
  photoPath,
  CARD_FORMAT_VERSION,
  MAX_PHOTOS,
  buildCardConfig,
  freshCardId,
  PALETTE,
  PALETTE_RGB,
  type CardConfig,
  type CardConfigSlideshow,
  type Orientation,
} from "../cardFormat";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CHROMA_WEIGHT,
  DEFAULT_EDIT_DEFAULTS,
  DEFAULT_SORT_MODE,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  defaultEditState,
  normalizeEdit,
  originalPath,
  type DitherConfig,
  type EditDefaults,
  type EditState,
  type ImportedImage,
  type ManifestPhoto,
  type MessageSpec,
  type OutputSettings,
  type PebbleManifest,
  type Photo,
  type PreviewColors,
  type SortMode,
} from "../types";
import {
  averageColor,
  cropIndicesWindow,
  decodeBlob,
  lumaHistogram,
  renderEditedImageData,
  renderFrameImageData,
  smartCropOffset,
} from "../pipeline/imageProcessing";
import { autoToneFromHistogram } from "../pipeline/autoTone";
import { autoWhiteBalance } from "../pipeline/whiteBalance";
import { ditherImage, DitherSupersededError } from "../dither/ditherClient";
import { encodeBmp, encodeIndexed4 } from "../pipeline/encode";
import {
  buildZipBlob,
  triggerDownload,
  writeBundleToDirectory,
  syncClockToDirectory,
  type BundleFile,
} from "../pipeline/bundle";
import { readTakenAt } from "../sources/exif";
import {
  clearBlobs,
  clearMeta,
  deleteBlob,
  getAllBlobs,
  getMeta,
  requestPersistence,
  saveBlob,
  saveMeta,
  type PersistedMeta,
} from "./persistence";
import * as cardIO from "./cardIO";
import type { ParsedCard } from "./cardIO";
import { adjacentId } from "./selection";

export interface BatchProgress {
  active: boolean;
  done: number;
  total: number;
}

export type ExportPhase = "idle" | "processing" | "building" | "done" | "error";

export interface ExportStatus {
  phase: ExportPhase;
  message?: string;
}

export interface StoreState {
  photos: Photo[];
  selectedId: string | null;
  orientation: Orientation;
  slideshow: CardConfigSlideshow;
  output: OutputSettings;
  sortMode: SortMode;
  editDefaults: EditDefaults;
  /** OKLab chroma emphasis ("colorfulness") applied to all photos. */
  chromaWeight: number;
  /** Whether to write original files to the card for full re-editing on import. */
  storeOriginals: boolean;
  /** How the dithered preview renders palette indices (view-only; see PreviewColors). */
  previewColors: PreviewColors;
  /** Bumped on each export so generations can be told apart. */
  generation: number;
  batch: BatchProgress;
  exportStatus: ExportStatus;
  importStatus: ExportStatus;
}

const [state, setState] = createStore<StoreState>({
  photos: [],
  selectedId: null,
  orientation: DEFAULT_ORIENTATION,
  slideshow: { ...DEFAULT_SLIDESHOW },
  output: { format: "indexed4" },
  sortMode: DEFAULT_SORT_MODE,
  editDefaults: { ...DEFAULT_EDIT_DEFAULTS },
  chromaWeight: DEFAULT_CHROMA_WEIGHT,
  storeOriginals: true,
  previewColors: "vivid",
  generation: 0,
  batch: { active: false, done: 0, total: 0 },
  exportStatus: { phase: "idle" },
  importStatus: { phase: "idle" },
});

export { state };

/* ------------------------------------------------------------------ *
 * Module-scoped helpers / caches (not reactive)
 * ------------------------------------------------------------------ */

// Guards against double-hydration (e.g. dev double-invoke).
let hydrateStarted = false;

// Autosave must NOT run until hydration has settled. The autosave effect and the
// pagehide flush both serialize the *current* in-memory state; if either fired
// during the async load window (state still empty), it would overwrite the real
// saved meta with an empty one — silently wiping a session on refresh even though
// "saved" was shown. We flip this true at every hydrate exit, then let normal
// reactivity persist from there.
let persistReady = false;

// Cached dithered frame for the SELECTED photo, so panning is a cheap crop.
let frameCache: {
  id: string;
  key: string;
  indices: Uint8Array;
  frameW: number;
  frameH: number;
} | null = null;

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Identity of everything that affects the dithered frame EXCEPT pan offset. */
function frameKey(e: EditState, orientation: Orientation, chromaWeight: number): string {
  return [
    orientation,
    e.rotation,
    e.zoom,
    e.cropMode,
    e.brightness,
    e.contrast,
    e.saturation,
    e.temperature,
    e.tint,
    e.sharpness,
    e.algorithm,
    e.ditherStrength,
    e.serpentine,
    e.orderedMatrix,
    chromaWeight,
    e.background.type,
    e.background.color.join(","),
  ].join("|");
}

function mergeDefaults(d: EditDefaults, patch: Partial<EditState>): EditDefaults {
  return {
    algorithm: patch.algorithm ?? d.algorithm,
    ditherStrength: patch.ditherStrength ?? d.ditherStrength,
    serpentine: patch.serpentine ?? d.serpentine,
    orderedMatrix: patch.orderedMatrix ?? d.orderedMatrix,
    cropMode: patch.cropMode ?? d.cropMode,
    background: patch.background ?? d.background,
  };
}

function ditherConfigFor(photo: Photo, chromaWeight: number): DitherConfig {
  const { edit } = photo;
  // A pure-text "card" message is rendered entirely from exact palette colors
  // (solid background + palette text), so diffusing/ordering it only speckles
  // the anti-aliased glyph edges and muddies a frame that is already a perfect
  // palette match. Force a crisp nearest-quantize (and skip the unsharp halo) so
  // text renders sharp from the palette, regardless of the global algorithm.
  if (photo.message?.layout === "card") {
    return {
      algorithm: "nearest",
      strength: edit.ditherStrength / 100,
      serpentine: edit.serpentine,
      orderedMatrix: edit.orderedMatrix,
      sharpness: 0,
      chromaWeight,
    };
  }
  return {
    algorithm: edit.algorithm,
    strength: edit.ditherStrength / 100,
    serpentine: edit.serpentine,
    orderedMatrix: edit.orderedMatrix,
    sharpness: edit.sharpness / 100,
    chromaWeight,
  };
}

function takenKey(p: Photo): number {
  return p.takenAt ?? p.modifiedAt ?? p.addedAt;
}

/**
 * Stable tiebreaker for date sorts. Folder imports arrive in whatever order the
 * file picker hands them over (which is NOT stable run-to-run), and many photos
 * share a capture/modified second or have no EXIF at all — so without an
 * explicit tiebreaker the list order was non-deterministic. Break ties by
 * natural filename, then by id (always unique), so the same set of photos always
 * lands in the same order.
 */
function tiebreak(a: Photo, b: Photo): number {
  return (
    a.name.localeCompare(b.name, undefined, { numeric: true }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function sortPhotos(photos: Photo[], mode: SortMode): Photo[] {
  if (mode === "manual") return photos;
  const modified = (p: Photo) => p.modifiedAt ?? p.addedAt;
  const arr = [...photos];
  switch (mode) {
    case "taken-desc":
      arr.sort((a, b) => takenKey(b) - takenKey(a) || tiebreak(a, b));
      break;
    case "taken-asc":
      arr.sort((a, b) => takenKey(a) - takenKey(b) || tiebreak(a, b));
      break;
    case "modified-desc":
      arr.sort((a, b) => modified(b) - modified(a) || tiebreak(a, b));
      break;
    case "modified-asc":
      arr.sort((a, b) => modified(a) - modified(b) || tiebreak(a, b));
      break;
    case "name-asc":
      arr.sort((a, b) => tiebreak(a, b));
      break;
  }
  return arr;
}

function findPhoto(id: string): Photo | undefined {
  return state.photos.find((p) => p.id === id);
}

/**
 * Run `fn` over `items` at most `limit` at a time, preserving result order.
 * The background image passes (smart-crop, auto-enhance) each decode a photo to
 * a full-resolution bitmap; a plain `Promise.all` over a freshly-imported batch
 * starts EVERY decode at once, so dropping 50 phone photos peaks at 50 full-res
 * `createImageBitmap` decodes simultaneously — hundreds of MB to gigabytes of
 * transient RAM. Capping the in-flight count keeps the peak bounded (and lets
 * the small bitmap cache actually serve reuse) while still using all cores.
 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/** Bound for concurrent full-resolution decodes in background image passes.
 *  Matches the decoded-bitmap cache size so the in-flight set and the cache
 *  stay in step. */
const BG_DECODE_CONCURRENCY = 4;

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export async function hydrate(): Promise<void> {
  if (hydrateStarted) return;
  hydrateStarted = true;
  // Pin storage so the browser can't evict our saved work under disk pressure.
  // Fire-and-forget; runs once regardless of whether there's anything to load.
  void requestPersistence();
  try {
    if (state.photos.length > 0) return;

    const meta = await getMeta();
    if (!meta) return;
    const blobs = await getAllBlobs();

    const photos: Photo[] = [];
    for (const id of meta.order) {
      const blob = blobs.get(id);
      const pm = meta.photos[id];
      if (!blob || !pm) continue;
      photos.push({
        id,
        name: pm.name,
        sourceKind: pm.sourceKind,
        blob,
        originalUrl: URL.createObjectURL(blob),
        status: "idle",
        edit: normalizeEdit(pm.edit, meta.settings.editDefaults),
        dirty: true,
        rev: 0,
        addedAt: pm.addedAt ?? Date.now(),
        modifiedAt: pm.modifiedAt,
        takenAt: pm.takenAt,
        message: pm.message,
        originalExt: pm.originalExt,
      });
    }
    if (photos.length === 0) return;

    setState(
      produce((s) => {
        s.photos = photos;
        s.selectedId = photos[0].id;
        s.orientation = meta.settings.orientation;
        s.slideshow = meta.settings.slideshow;
        s.output = meta.settings.output;
        s.sortMode = meta.settings.sortMode ?? DEFAULT_SORT_MODE;
        s.editDefaults = { ...DEFAULT_EDIT_DEFAULTS, ...meta.settings.editDefaults };
        s.chromaWeight = meta.settings.chromaWeight ?? DEFAULT_CHROMA_WEIGHT;
        s.previewColors = meta.settings.previewColors ?? "vivid";
      }),
    );
    void processAll();
  } finally {
    // From here on, in-memory state reflects what's on disk (or there was
    // nothing to load) — autosave is safe to persist.
    persistReady = true;
  }
}

export function addImages(images: ImportedImage[]): void {
  if (images.length === 0) return;
  const now = Date.now();
  const newPhotos: Photo[] = images.map((img) => ({
    id: genId(),
    name: img.name,
    sourceKind: img.sourceKind,
    blob: img.blob,
    originalUrl: URL.createObjectURL(img.blob),
    status: "idle",
    edit: defaultEditState(state.editDefaults),
    dirty: true,
    rev: 0,
    addedAt: now,
    modifiedAt: img.lastModified,
    takenAt: img.takenAt,
    message: img.message,
    originalExt: extOf(img.name),
  }));

  setState("photos", (ps) => sortPhotos([...ps, ...newPhotos], state.sortMode));
  if (!state.selectedId) setState("selectedId", newPhotos[0].id);

  for (const p of newPhotos) void saveBlob(p.id, p.blob);
  void processAll();

  // Pull EXIF capture time in the background; re-sort if sorting by it.
  void Promise.all(
    newPhotos.map(async (p) => {
      if (p.takenAt !== undefined) return;
      const taken = await readTakenAt(p.blob);
      if (taken !== undefined) {
        setState("photos", (x) => x.id === p.id, "takenAt", taken);
      }
    }),
  ).then(() => {
    if (state.sortMode.startsWith("taken")) {
      setState("photos", (ps) => sortPhotos(ps, state.sortMode));
    }
  });

  // Smart default crop (background, fully on-device): when fill mode crops a
  // photo, slide the window to keep the busiest region in frame instead of a
  // blind center crop. Only applies while the user hasn't panned yet (offsets
  // still 0,0); message cards are authored, not cropped, so skip them.
  const { width, height } = displaySize(state.orientation);
  void mapLimit(newPhotos, BG_DECODE_CONCURRENCY, async (p) => {
    if (p.message) return null;
    try {
      const bitmap = await decodeBlob(p.blob);
      const offset = smartCropOffset(bitmap, p.edit, width, height);
      return offset ? { id: p.id, offset } : null;
    } catch {
      return null; // unreadable image — leave the center crop
    }
  }).then((results) => {
    let changed = false;
    setState(
      produce((s) => {
        for (const r of results) {
          if (!r) continue;
          const p = s.photos.find((q) => q.id === r.id);
          if (!p || p.edit.offsetX !== 0 || p.edit.offsetY !== 0) continue;
          p.edit.offsetX = r.offset.offsetX;
          p.edit.offsetY = r.offset.offsetY;
          p.dirty = true;
          p.rev += 1;
          changed = true;
        }
      }),
    );
    if (changed) {
      frameCache = null;
      reprocessAllSoon();
    }
  });
}

function extOf(name: string): string | undefined {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : undefined;
}

export function removePhoto(id: string): void {
  const photo = findPhoto(id);
  if (photo) URL.revokeObjectURL(photo.originalUrl);
  if (frameCache?.id === id) frameCache = null;
  setState(
    produce((s) => {
      s.photos = s.photos.filter((p) => p.id !== id);
      if (s.selectedId === id) s.selectedId = s.photos[0]?.id ?? null;
    }),
  );
  void deleteBlob(id);
}

export function clearAll(): void {
  for (const p of state.photos) URL.revokeObjectURL(p.originalUrl);
  frameCache = null;
  setState(
    produce((s) => {
      s.photos = [];
      s.selectedId = null;
      s.exportStatus = { phase: "idle" };
    }),
  );
  void clearBlobs();
  void clearMeta();
}

export function reorderPhotos(fromId: string, toId: string): void {
  if (fromId === toId) return;
  setState(
    produce((s) => {
      const from = s.photos.findIndex((p) => p.id === fromId);
      const to = s.photos.findIndex((p) => p.id === toId);
      if (from === -1 || to === -1) return;
      const [moved] = s.photos.splice(from, 1);
      s.photos.splice(to, 0, moved);
      s.sortMode = "manual";
    }),
  );
}

/** Move a photo `delta` positions within the list (clamped to the ends),
 *  switching to manual sort. Returns true if the order actually changed, so
 *  keyboard callers can decide whether to move focus. */
export function movePhotoStep(id: string, delta: number): boolean {
  let changed = false;
  setState(
    produce((s) => {
      const from = s.photos.findIndex((p) => p.id === id);
      if (from === -1) return;
      const to = Math.max(0, Math.min(s.photos.length - 1, from + delta));
      if (from === to) return;
      const [moved] = s.photos.splice(from, 1);
      s.photos.splice(to, 0, moved);
      s.sortMode = "manual";
      changed = true;
    }),
  );
  return changed;
}

export function setSortMode(mode: SortMode): void {
  setState(
    produce((s) => {
      s.sortMode = mode;
      s.photos = sortPhotos(s.photos, mode);
    }),
  );
}

export function selectPhoto(id: string | null): void {
  if (id !== frameCache?.id) frameCache = null;
  setState("selectedId", id);
}

/** Move the selection `delta` rows within the current (sorted) list order,
 *  clamped at the ends. Returns the newly-selected id so callers can move focus
 *  to match (roving-focus keyboard navigation in the photo list). */
export function selectAdjacent(delta: number): string | null {
  const id = adjacentId(
    state.photos.map((p) => p.id),
    state.selectedId,
    delta,
  );
  if (id) selectPhoto(id);
  return id;
}

export function updateEdit(id: string, patch: Partial<EditState>): void {
  setState(
    produce((s) => {
      const p = s.photos.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p.edit, patch);
      p.dirty = true;
      p.rev += 1;
    }),
  );
}

export function panSelected(id: string, offsetX: number, offsetY: number): void {
  const photo = findPhoto(id);
  if (!photo) return;
  const { width, height } = displaySize(state.orientation);
  const newEdit = { ...photo.edit, offsetX, offsetY };
  const key = frameKey(newEdit, state.orientation, state.chromaWeight);

  if (frameCache && frameCache.id === id && frameCache.key === key) {
    const indices = cropIndicesWindow(
      frameCache.indices,
      frameCache.frameW,
      frameCache.frameH,
      width,
      height,
      offsetX,
      offsetY,
    );
    setState(
      produce((s) => {
        const p = s.photos.find((x) => x.id === id);
        if (!p) return;
        p.edit.offsetX = offsetX;
        p.edit.offsetY = offsetY;
        p.status = "ready";
        p.dirty = false;
        // Bump rev even though the result is already final: an in-flight
        // processPhoto captured the pre-pan rev, and without the bump its
        // late commit() would pass the rev guard and stomp this crop with
        // one computed from stale edit state.
        p.rev += 1;
        p.result = { indices, width, height };
      }),
    );
  } else {
    setState(
      produce((s) => {
        const p = s.photos.find((x) => x.id === id);
        if (!p) return;
        p.edit.offsetX = offsetX;
        p.edit.offsetY = offsetY;
        p.dirty = true;
        p.rev += 1;
      }),
    );
  }
}

export function resetEdit(id: string): void {
  setState(
    produce((s) => {
      const p = s.photos.find((x) => x.id === id);
      if (!p) return;
      p.edit = defaultEditState(s.editDefaults);
      p.dirty = true;
      p.rev += 1;
    }),
  );
}

export function rotatePhoto(id: string, delta: 90 | -90): void {
  setState(
    produce((s) => {
      const p = s.photos.find((x) => x.id === id);
      if (!p) return;
      const rotation = (((p.edit.rotation + delta) % 360) + 360) % 360;
      p.edit.rotation = rotation as EditState["rotation"];
      p.dirty = true;
      p.rev += 1;
    }),
  );
}

export function setOrientation(orientation: Orientation): void {
  setState(
    produce((s) => {
      s.orientation = orientation;
      for (const p of s.photos) {
        p.dirty = true;
        p.rev += 1;
      }
    }),
  );
  frameCache = null;
  void processAll();
}

export function applyToAll(patch: Partial<EditState>): void {
  setState(
    produce((s) => {
      s.editDefaults = mergeDefaults(s.editDefaults, patch);
      for (const p of s.photos) {
        Object.assign(p.edit, patch);
        p.dirty = true;
        p.rev += 1;
      }
    }),
  );
  reprocessAllSoon();
}

export function setChromaWeight(weight: number): void {
  setState(
    produce((s) => {
      s.chromaWeight = weight;
      for (const p of s.photos) {
        p.dirty = true;
        p.rev += 1;
      }
    }),
  );
  frameCache = null;
  reprocessAllSoon();
}

/**
 * Content-aware auto-enhance: per photo, sample its luminance histogram and
 * derive an auto-levels brightness/contrast stretch, then pair it with the
 * panel-friendly saturation/sharpness defaults. Each photo gets its OWN
 * brightness/contrast (unlike the old behaviour, which just reset every photo to
 * the same fixed defaults). Message cards are skipped so the card's flat palette
 * colors — and the export contract — are never shifted off-palette.
 */
export async function autoEnhance(): Promise<void> {
  const targets = state.photos.filter((p) => !p.message);
  if (targets.length === 0) return;

  const tones = await mapLimit(targets, BG_DECODE_CONCURRENCY, async (p) => {
    try {
      const bitmap = await decodeBlob(p.blob);
      const [mr, mg, mb] = averageColor(bitmap);
      return {
        id: p.id,
        tone: autoToneFromHistogram(lumaHistogram(bitmap)),
        wb: autoWhiteBalance(mr, mg, mb),
      };
    } catch {
      // Unreadable image — fall back to the gentle e-ink defaults, no cast fix.
      return {
        id: p.id,
        tone: { brightness: DEFAULT_ADJUSTMENTS.brightness, contrast: DEFAULT_ADJUSTMENTS.contrast },
        wb: { temperature: 0, tint: 0 },
      };
    }
  });

  setState(
    produce((s) => {
      for (const { id, tone, wb } of tones) {
        const p = s.photos.find((q) => q.id === id);
        if (!p) continue;
        p.edit.brightness = tone.brightness;
        p.edit.contrast = tone.contrast;
        p.edit.saturation = DEFAULT_ADJUSTMENTS.saturation;
        p.edit.temperature = wb.temperature;
        p.edit.tint = wb.tint;
        p.edit.sharpness = DEFAULT_ADJUSTMENTS.sharpness;
        p.dirty = true;
        p.rev += 1;
      }
    }),
  );
  frameCache = null;
  reprocessAllSoon();
}

export function setSlideshow(patch: Partial<CardConfigSlideshow>): void {
  setState("slideshow", (s) => ({ ...s, ...patch }));
}

export function setOutputFormat(format: OutputSettings["format"]): void {
  setState("output", "format", format);
}

export function setStoreOriginals(value: boolean): void {
  setState("storeOriginals", value);
}

export function setPreviewColors(value: PreviewColors): void {
  setState("previewColors", value);
}

export async function processPhoto(id: string): Promise<void> {
  const photo = findPhoto(id);
  if (!photo) return;
  const startRev = photo.rev;
  const { orientation, chromaWeight } = state;
  const { width, height } = displaySize(orientation);
  const isSelected = state.selectedId === id;

  const commit = (indices: Uint8Array) => {
    const cur = findPhoto(id);
    if (!cur || cur.rev !== startRev) return;
    setState("photos", (p) => p.id === id, {
      status: "ready",
      dirty: false,
      error: undefined,
      result: { indices, width, height },
    });
  };

  const fail = (err: unknown) => {
    const cur = findPhoto(id);
    if (!cur || cur.rev !== startRev) return;
    setState("photos", (p) => p.id === id, {
      status: "error",
      dirty: false,
      error: err instanceof Error ? err.message : String(err),
    });
  };

  const markProcessing = () =>
    setState("photos", (p) => p.id === id, { status: "processing", error: undefined });

  try {
    const key = isSelected ? frameKey(photo.edit, orientation, chromaWeight) : "";

    // Fast path: a cached frame for the selected photo only needs a crop window
    // — no decode, no re-dither — so commit it before touching anything else.
    if (isSelected && frameCache && frameCache.id === id && frameCache.key === key) {
      commit(
        cropIndicesWindow(
          frameCache.indices,
          frameCache.frameW,
          frameCache.frameH,
          width,
          height,
          photo.edit.offsetX,
          photo.edit.offsetY,
        ),
      );
      return;
    }

    // Mark processing BEFORE the async decode, not after, so the preview shows
    // its "rendering" overlay immediately on selection. Otherwise the previous
    // photo's dithered frame (held in `result`) stays fully visible through the
    // whole decode, so the dither appears to load before the original and before
    // any loading hint — the select-time flash this fixes.
    markProcessing();
    const bitmap = await decodeBlob(photo.blob);

    if (isSelected) {
      const frame = renderFrameImageData(bitmap, photo.edit, width, height);
      const frameIndices = await ditherImage(
        frame.data,
        PALETTE_RGB,
        ditherConfigFor(photo, chromaWeight),
      );
      const cur = findPhoto(id);
      if (!cur || cur.rev !== startRev) return;
      frameCache = {
        id,
        key,
        indices: frameIndices,
        frameW: frame.frameW,
        frameH: frame.frameH,
      };
      commit(
        cropIndicesWindow(
          frameIndices,
          frame.frameW,
          frame.frameH,
          width,
          height,
          photo.edit.offsetX,
          photo.edit.offsetY,
        ),
      );
    } else {
      const edited = renderEditedImageData(bitmap, photo.edit, width, height);
      const indices = await ditherImage(
        edited,
        PALETTE_RGB,
        ditherConfigFor(photo, chromaWeight),
      );
      commit(indices);
    }
  } catch (err) {
    if (err instanceof DitherSupersededError) return;
    fail(err);
  }
}

let activeBatch: Promise<void> | null = null;

export function processAll(): Promise<void> {
  // Join an in-flight batch rather than resolving immediately: callers like
  // exportBundle await processAll() to mean "all edits are rendered", and an
  // instant return would let them export STALE results mid-batch.
  if (activeBatch) return activeBatch;
  if (!state.photos.some((p) => p.dirty)) return Promise.resolve();
  activeBatch = runBatch().finally(() => {
    activeBatch = null;
  });
  return activeBatch;
}

async function runBatch(): Promise<void> {
  setState("batch", { active: true, done: 0, total: 0 });
  try {
    // Run up to `concurrency` processPhoto calls in flight so distinct photos
    // dither in parallel across the worker pool instead of strictly serially.
    // Match the worker-pool size: one per core, clamped to [1, 8].
    const concurrency = Math.min(
      8,
      Math.max(
        1,
        typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4,
      ),
    );
    const maxIterations = state.photos.length * 4 + 50;
    const processed = new Set<string>();
    const inFlight = new Set<string>();
    let iterations = 0;

    // Pick the next dirty photo that isn't already being processed, preferring
    // ones not yet processed this run (so a slider that keeps re-dirtying one
    // photo can't starve the rest), then requeueing remaining dirty ones.
    const pickNext = (): string | null => {
      const dirty = state.photos.filter((p) => p.dirty && !inFlight.has(p.id));
      if (dirty.length === 0) return null;
      const next = dirty.find((p) => !processed.has(p.id)) ?? dirty[0];
      return next.id;
    };

    const runOne = async (id: string): Promise<void> => {
      inFlight.add(id);
      // Keep the total in step with how much work remains (active + queued).
      const remaining = state.photos.filter(
        (p) => p.dirty || inFlight.has(p.id),
      ).length;
      setState("batch", "total", (t) => Math.max(t, state.batch.done + remaining));
      try {
        await processPhoto(id);
      } finally {
        inFlight.delete(id);
        processed.add(id);
        setState("batch", "done", (d) => d + 1);
      }
    };

    // Pump: keep `concurrency` workers busy, refilling as each finishes. The
    // iteration bound guarantees this can't spin forever even if a photo stays
    // dirty (e.g. continuously re-edited) across the whole run.
    await new Promise<void>((resolve) => {
      const fill = (): void => {
        while (inFlight.size < concurrency && iterations < maxIterations) {
          const id = pickNext();
          if (id === null) break;
          iterations++;
          void runOne(id).then(fill);
        }
        if (inFlight.size === 0) resolve();
      };
      fill();
    });
  } finally {
    setState("batch", { active: false, done: 0, total: 0 });
  }
}

export function validateForExport(): string[] {
  const { photos } = state;
  const issues: string[] = [];
  if (photos.length === 0) {
    issues.push("No photos added yet.");
    return issues;
  }
  if (photos.length > MAX_PHOTOS) {
    // The firmware stops enumerating at MAX_PHOTOS; anything beyond would sit
    // on the card but never display, so refuse rather than silently truncate.
    issues.push(
      `Too many photos: ${photos.length} (the frame supports up to ${MAX_PHOTOS} per card). Remove ${photos.length - MAX_PHOTOS}.`,
    );
  }
  const errored = photos.filter((p) => p.status === "error");
  if (errored.length > 0) {
    issues.push(
      `${errored.length} photo(s) failed to process: ${errored.map((p) => p.name).join(", ")}.`,
    );
  }
  // Dirty photos have a result, but a STALE one - exporting it would burn the
  // previous edit onto the card.  (exportBundle re-runs processAll until this
  // converges; this is the backstop.)
  const unprocessed = photos.filter((p) => !p.result || p.dirty);
  if (unprocessed.length > 0) {
    issues.push(`${unprocessed.length} photo(s) still processing.`);
  }
  return issues;
}

/** Index of the item pinned as "show first after a card update", if any. */
function introIndex(): number | undefined {
  const i = state.photos.findIndex((p) => p.message?.placement === "intro");
  return i >= 0 ? i : undefined;
}

export function buildConfig(): CardConfig {
  const { orientation, slideshow, photos } = state;
  const { width, height } = displaySize(orientation);
  // buildCardConfig owns the (contractual) key order the firmware relies on.
  // A fresh card_id is drawn per build: every export is "new card data" to the
  // frame, which restarts its shuffle and shows the intro item (if any) first.
  return buildCardConfig(
    { width, height, format: "indexed4" },
    slideshow,
    photos.map((p, i) => ({ file: photoPath(i, "indexed4"), name: p.name })),
    freshCardId(),
    introIndex(),
  );
}

export async function exportBundle(mode: "zip" | "directory"): Promise<void> {
  setState("exportStatus", { phase: "processing", message: "Processing photos…" });
  try {
    // Re-run until no photo is dirty (bounded): the first await joins any
    // in-flight batch, later passes pick up photos edited meanwhile.
    for (let i = 0; i < 3 && state.photos.some((p) => p.dirty); i++) {
      await processAll();
    }
    const issues = validateForExport();
    if (issues.length > 0) {
      setState("exportStatus", { phase: "error", message: issues.join(" ") });
      return;
    }

    const { photos, output, orientation } = state;
    const format = output.format;
    const files: BundleFile[] = photos.map((p, i) => {
      const r = p.result!;
      const bytes =
        format === "indexed4"
          ? encodeIndexed4(r.indices, r.width, r.height, PALETTE)
          : encodeBmp(r.indices, r.width, r.height, PALETTE);
      return { path: photoPath(i, format), bytes };
    });

    const config = buildConfig();
    if (format === "bmp") {
      // Debug export: config must describe what's actually on the card.
      config.display = { ...config.display, format: "bmp" };
      config.photos = photos.map((p, i) => ({ file: photoPath(i, "bmp"), name: p.name }));
    }

    // Round-trip sidecar (the firmware never reads .pebble/): a rich manifest
    // plus, by default, the original photos — so re-importing this card later
    // restores the full editable project and merges new photos seamlessly.
    setState("generation", (g) => g + 1);
    const manifest = await assembleManifest(files);
    files.push({
      path: MANIFEST_PATH,
      bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });
    if (state.storeOriginals) {
      for (const p of photos) {
        const ext = p.originalExt ?? "bin";
        files.push({
          path: originalPath(p.id, ext),
          bytes: new Uint8Array(await p.blob.arrayBuffer()),
        });
      }
    }

    if (mode === "directory") {
      setState("exportStatus", { phase: "building", message: "Writing to folder…" });
      const dirName = await writeBundleToDirectory(config, files);
      setState("exportStatus", {
        phase: "done",
        message: `Wrote ${files.length} photos to "${dirName}".`,
      });
    } else {
      setState("exportStatus", { phase: "building", message: "Building bundle…" });
      const blob = await buildZipBlob(config, files);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `photo-pebble-${orientation}-${stamp}.zip`);
      setState("exportStatus", { phase: "done", message: `Downloaded ${files.length} photos.` });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      setState("exportStatus", { phase: "idle" });
      return;
    }
    setState("exportStatus", {
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Deliberately set the frame's clock by dropping a fresh one-shot clock.txt onto
 * the card (see syncClockToDirectory). Kept separate from exportBundle so a
 * routine photo export never silently resets an already-correct clock.
 */
export async function syncClock(): Promise<void> {
  setState("exportStatus", { phase: "building", message: "Writing clock…" });
  try {
    const dirName = await syncClockToDirectory();
    setState("exportStatus", {
      phase: "done",
      message: `Set the frame's clock on "${dirName}". Insert the card promptly.`,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      setState("exportStatus", { phase: "idle" });
      return;
    }
    setState("exportStatus", {
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Messages (text cards) + round-trip import
 * ------------------------------------------------------------------ */

async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

async function assembleManifest(binFiles: BundleFile[]): Promise<PebbleManifest> {
  const { photos } = state;
  const manifestPhotos: ManifestPhoto[] = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const ext = p.originalExt ?? "bin";
    manifestPhotos.push({
      id: p.id,
      binFile: binFiles[i].path,
      originalFile: state.storeOriginals ? originalPath(p.id, ext) : null,
      name: p.name,
      sourceKind: p.sourceKind,
      takenAt: p.takenAt,
      modifiedAt: p.modifiedAt,
      addedAt: p.addedAt,
      edit: p.edit,
      message: p.message,
      binSha256: await sha256Hex(binFiles[i].bytes),
    });
  }
  const now = Date.now();
  return {
    manifestVersion: MANIFEST_VERSION,
    cardFormatVersion: CARD_FORMAT_VERSION,
    generation: state.generation,
    createdAt: now,
    updatedAt: now,
    app: { name: "Photo Pebble", version: "1.0.0" },
    settings: {
      orientation: state.orientation,
      sortMode: state.sortMode,
      slideshow: state.slideshow,
      editDefaults: state.editDefaults,
      chromaWeight: state.chromaWeight,
      storeOriginals: state.storeOriginals,
    },
    photos: manifestPhotos,
  };
}

/**
 * At most ONE item may be the "first after a card update" intro (the config
 * contract has a single intro_index). Saving a message as intro silently
 * demotes any other intro item back to the random rotation.
 */
function clearOtherIntros(exceptId: string | null): void {
  setState(
    produce((s) => {
      for (const p of s.photos) {
        if (p.id !== exceptId && p.message?.placement === "intro") {
          p.message.placement = "random";
        }
      }
    }),
  );
}

/** Add a rendered message (text card / photo+text) as a new gallery item. */
export function addMessageImage(blob: Blob, spec: MessageSpec, name = "message"): void {
  if (spec.placement === "intro") clearOtherIntros(null);
  addImages([{ blob, name: `${name}.png`, sourceKind: "message", message: spec }]);
}

/** Replace a message item's rendered image + spec (after re-editing it). */
export function updateMessage(id: string, spec: MessageSpec, blob: Blob): void {
  const photo = findPhoto(id);
  if (!photo) return;
  if (spec.placement === "intro") clearOtherIntros(id);
  URL.revokeObjectURL(photo.originalUrl);
  const url = URL.createObjectURL(blob);
  setState(
    produce((s) => {
      const p = s.photos.find((x) => x.id === id);
      if (!p) return;
      p.message = spec;
      p.blob = blob;
      p.originalUrl = url;
      p.dirty = true;
      p.rev += 1;
    }),
  );
  void saveBlob(id, blob);
}

function buildPhotoFromManifest(mp: ManifestPhoto, blob: Blob): Photo {
  return {
    id: mp.id,
    name: mp.name,
    sourceKind: mp.sourceKind,
    blob,
    originalUrl: URL.createObjectURL(blob),
    status: "idle",
    edit: normalizeEdit(mp.edit),
    dirty: true,
    rev: 0,
    addedAt: mp.addedAt,
    modifiedAt: mp.modifiedAt,
    takenAt: mp.takenAt,
    message: mp.message,
    originalExt: mp.originalFile ? extOf(mp.originalFile) : undefined,
  };
}

function applyParsedCard(parsed: ParsedCard): number {
  const m = parsed.manifest;
  if (!m) {
    throw new Error("This card has no Photo Pebble project data to import.");
  }
  const incoming: Photo[] = [];
  for (const mp of m.photos) {
    const blob = parsed.originals.get(mp.id);
    if (!blob) continue; // metadata-only export → can't re-edit without original
    incoming.push(buildPhotoFromManifest(mp, blob));
  }
  setState(
    produce((s) => {
      s.orientation = m.settings.orientation;
      s.slideshow = m.settings.slideshow;
      s.sortMode = m.settings.sortMode;
      s.editDefaults = { ...DEFAULT_EDIT_DEFAULTS, ...m.settings.editDefaults };
      s.chromaWeight = m.settings.chromaWeight;
      s.storeOriginals = m.settings.storeOriginals;
      s.generation = m.generation;
      const existing = new Set(s.photos.map((p) => p.id));
      for (const p of incoming) if (!existing.has(p.id)) s.photos.push(p);
      if (!s.selectedId) s.selectedId = s.photos[0]?.id ?? null;
    }),
  );
  setState("photos", (ps) => sortPhotos(ps, state.sortMode));
  for (const p of incoming) void saveBlob(p.id, p.blob);
  void processAll();
  return incoming.length;
}

/** Import an existing card (a chosen folder or an uploaded .zip) and merge it. */
export async function importCard(source: FileSystemDirectoryHandle | File): Promise<void> {
  setState("importStatus", { phase: "processing", message: "Reading card…" });
  try {
    const parsed = await cardIO.parseCard(source);
    const count = applyParsedCard(parsed);
    setState("importStatus", { phase: "done", message: `Imported ${count} item(s).` });
  } catch (err) {
    setState("importStatus", {
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Debounced batch reprocessing for the global "all photos" controls.
 * ------------------------------------------------------------------ */
let reprocessTimer: ReturnType<typeof setTimeout> | null = null;
function reprocessAllSoon(): void {
  if (reprocessTimer) clearTimeout(reprocessTimer);
  reprocessTimer = setTimeout(() => {
    reprocessTimer = null;
    void processAll();
  }, 250);
}

/* ------------------------------------------------------------------ *
 * Autosave lightweight metadata (order, edits, settings) to IndexedDB.
 * ------------------------------------------------------------------ */
function buildMeta(): PersistedMeta {
  // Nested values (edit, message, settings objects) are live Solid store proxies.
  // IndexedDB's structured clone CANNOT serialize a proxy — it throws
  // DataCloneError — so every nested object must be unwrap()'d to its raw,
  // plain backing object first. Missing this silently dropped every meta write
  // (blobs persisted, meta didn't), which read back as a wiped session on
  // refresh even though the indicator said "saved".
  return {
    order: state.photos.map((p) => p.id),
    photos: Object.fromEntries(
      state.photos.map((p) => [
        p.id,
        {
          name: p.name,
          sourceKind: p.sourceKind,
          edit: unwrap(p.edit),
          addedAt: p.addedAt,
          modifiedAt: p.modifiedAt,
          takenAt: p.takenAt,
          message: p.message ? unwrap(p.message) : undefined,
          originalExt: p.originalExt,
        },
      ]),
    ),
    settings: {
      orientation: state.orientation,
      slideshow: unwrap(state.slideshow),
      output: unwrap(state.output),
      sortMode: state.sortMode,
      editDefaults: unwrap(state.editDefaults),
      chromaWeight: state.chromaWeight,
      previewColors: state.previewColors,
    },
  };
}

/**
 * Reactive autosave status for the header indicator, so the user can trust that
 * their (zero-friction, local-only) work is being persisted. "saving" while a
 * write is pending/in-flight, "saved" once it actually lands, "error" if the
 * write failed (e.g. private mode, or a non-cloneable value), "idle" before the
 * first change. saveMeta now reports real success/failure, so "saved" reflects a
 * durable write rather than merely an attempt — a silent failure here is exactly
 * what masked the refresh-wipes-everything bug.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error";
const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("idle");
export { saveStatus };

let saveSeq = 0;
async function runSave(): Promise<void> {
  const seq = ++saveSeq;
  setSaveStatus("saving");
  const ok = await saveMeta(buildMeta());
  // Only the latest save may flip the indicator; a newer change that started
  // another save keeps us in "saving" until that one resolves.
  if (seq === saveSeq) setSaveStatus(ok ? "saved" : "error");
}

let metaTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleMetaSave(): void {
  setSaveStatus("saving");
  if (metaTimer) clearTimeout(metaTimer);
  metaTimer = setTimeout(() => {
    metaTimer = null;
    void runSave();
  }, 400);
}

export function flushPersist(): void {
  // Never flush before hydration settles — state is still empty and would
  // clobber the real saved meta (the refresh-wipes-everything bug).
  if (!persistReady) return;
  if (metaTimer) {
    clearTimeout(metaTimer);
    metaTimer = null;
  }
  void runSave();
}

if (typeof window !== "undefined") {
  // Track the persisted slice reactively; any change reschedules a debounced save.
  createRoot(() => {
    createEffect(() => {
      // Touch the fields that buildMeta serializes so the effect subscribes.
      state.photos.length;
      for (const p of state.photos) {
        p.id;
        p.edit;
        p.name;
        p.takenAt;
        p.message;
      }
      state.orientation;
      state.slideshow;
      state.output;
      state.sortMode;
      state.editDefaults;
      state.chromaWeight;
      state.previewColors;
      // Stay subscribed to all of the above, but don't persist until hydration
      // has settled — otherwise the effect's immediate first run (empty state,
      // racing the async load) writes an empty meta over real saved work.
      if (!persistReady) return;
      scheduleMetaSave();
    });
  });
  window.addEventListener("pagehide", flushPersist);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });
}
