/**
 * cardIO — reading an existing card back into the studio (round-trip import).
 *
 * Writing a card is handled in the store's exportBundle (it just appends the
 * `.pebble/manifest.json` + originals to the bundle). Reading one back is the
 * job of this module: parse a chosen directory (File System Access) or an
 * uploaded .zip into a ParsedCard the store can turn into editable photos.
 *
 * The store calls `parseCard()`; everything below the seam is owned by the
 * import/round-trip workstream.
 *
 * On-card layout we read (mirror of the export side):
 *
 *   <card root>/
 *     config.json                      (firmware-facing; ignored on import)
 *     photos/000.bin, 001.bin, ...     (PBL1 images — decoded as a fallback)
 *     .pebble/manifest.json            (studio sidecar → manifest)
 *     .pebble/originals/<id>.<ext>     (original photos, keyed by manifest id)
 */
import JSZip from "jszip";
import {
  HEADER_BYTES,
  MAGIC,
  MANIFEST_PATH,
  ORIGINALS_DIR,
  PALETTE,
  PHOTOS_DIR,
  type PebbleManifest,
} from "@pebble/shared";
import { log } from "../log";

export interface ParsedCard {
  /** The studio manifest, if the card was made by Photo Pebble. */
  manifest: PebbleManifest | null;
  /** Original photo blobs keyed by manifest photo id (when originals stored). */
  originals: Map<string, Blob>;
  /**
   * Fallback when there is no manifest: the firmware-facing photos decoded to
   * displayable blobs, in card order. Lets the user at least reorder/retime.
   */
  bins: { name: string; blob: Blob }[];
}

/**
 * Parse a card source into a ParsedCard.
 * @param source a directory handle (File System Access) or an uploaded .zip File.
 */
export async function parseCard(
  source: FileSystemDirectoryHandle | File,
): Promise<ParsedCard> {
  const reader = isDirectoryHandle(source)
    ? await readFromDirectory(source)
    : await readFromZip(source);
  return assembleCard(reader);
}

/* ------------------------------------------------------------------ *
 * Source abstraction
 * ------------------------------------------------------------------ *
 *
 * Both source kinds collapse to the same thing: a flat map of card-relative
 * (forward-slash) paths to a lazy "get this entry as a Blob". Reading lazily
 * keeps us from slurping every .bin into memory when we only need a few.
 */

type CardFiles = Map<string, () => Promise<Blob>>;

function isDirectoryHandle(
  source: FileSystemDirectoryHandle | File,
): source is FileSystemDirectoryHandle {
  // A File is a Blob; a directory handle has kind === "directory".
  return (
    typeof File !== "undefined" &&
    !(source instanceof File) &&
    (source as FileSystemDirectoryHandle).kind === "directory"
  );
}

/** Flatten a File System Access directory tree into card-relative paths. */
async function readFromDirectory(
  root: FileSystemDirectoryHandle,
): Promise<CardFiles> {
  const files: CardFiles = new Map();
  await readDirRecursive(root, "", files);
  return files;
}

/**
 * `entries()` is async-iterable on FileSystemDirectoryHandle at runtime, but its
 * declaration lives in `lib.dom.asynciterable`, which this project's `lib` set
 * doesn't include. Declare just the shape we use so we stay typed without an
 * `any` (and without touching tsconfig).
 */
interface DirectoryHandleWithEntries {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
}

async function readDirRecursive(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: CardFiles,
): Promise<void> {
  const iterable = dir as unknown as DirectoryHandleWithEntries;
  for await (const [name, handle] of iterable.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      out.set(path, async () => fileHandle.getFile());
    } else {
      await readDirRecursive(handle as FileSystemDirectoryHandle, path, out);
    }
  }
}

/** Read every entry of an uploaded .zip into card-relative paths. */
async function readFromZip(file: File): Promise<CardFiles> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error(
      `Could not read this file as a card archive (.zip): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const files: CardFiles = new Map();
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    // Some archives prefix every path with a top-level folder; normalise the
    // path so ".pebble/…" / "photos/…" line up regardless of how it was zipped.
    const path = normalizeZipPath(relativePath);
    files.set(path, () => entry.async("blob"));
  });
  return files;
}

/** Normalise a zip entry path to a forward-slashed, leading-slash-free path. */
function normalizeZipPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\//, "");
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

async function assembleCard(files: CardFiles): Promise<ParsedCard> {
  const manifest = await readManifest(files);
  const originals = await readOriginals(files);
  const bins = await readBins(files);
  return { manifest, originals, bins };
}

/** Read and parse `.pebble/manifest.json` if present. */
async function readManifest(files: CardFiles): Promise<PebbleManifest | null> {
  const getter = lookup(files, MANIFEST_PATH);
  if (!getter) return null;
  try {
    const text = await (await getter()).text();
    return JSON.parse(text) as PebbleManifest;
  } catch (err) {
    // A corrupt manifest shouldn't kill the import — fall back to bins.
    log.warn("ignoring unreadable manifest.json", err);
    return null;
  }
}

/**
 * Read every file under `.pebble/originals/`, keyed by the manifest photo id
 * (the filename without its extension, e.g. "ab12.jpg" → "ab12").
 */
async function readOriginals(files: CardFiles): Promise<Map<string, Blob>> {
  const originals = new Map<string, Blob>();
  const prefix = `${ORIGINALS_DIR}/`;
  for (const [path, getter] of files) {
    if (!pathStartsWith(path, prefix)) continue;
    const filename = baseName(path);
    if (!filename) continue;
    const id = stripExt(filename);
    if (!id) continue;
    try {
      originals.set(id, await getter());
    } catch (err) {
      log.warn(`could not read original "${path}"`, err);
    }
  }
  return originals;
}

/**
 * Fallback path: read `photos/*.bin`, decode each PBL1 to a displayable PNG,
 * and return them in filename order so a card with no manifest is importable.
 */
async function readBins(
  files: CardFiles,
): Promise<{ name: string; blob: Blob }[]> {
  const prefix = `${PHOTOS_DIR}/`;
  const entries: { name: string; getter: () => Promise<Blob> }[] = [];
  for (const [path, getter] of files) {
    if (!pathStartsWith(path, prefix)) continue;
    const name = baseName(path);
    if (!name.toLowerCase().endsWith(".bin")) continue;
    entries.push({ name, getter });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const out: { name: string; blob: Blob }[] = [];
  for (const { name, getter } of entries) {
    try {
      const buf = new Uint8Array(await (await getter()).arrayBuffer());
      const image = decodePbl1(buf);
      if (!image) {
        log.warn(`"${name}" is not a valid PBL1 image; skipping.`);
        continue;
      }
      out.push({ name, blob: await imageDataToPng(image) });
    } catch (err) {
      log.warn(`could not decode "${name}"`, err);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * PBL1 decoding
 * ------------------------------------------------------------------ *
 *
 * Layout (see @pebble/shared cardFormat):
 *   bytes 0-3 : "PBL1"
 *   bytes 4-5 : width  (uint16-LE)
 *   bytes 6-7 : height (uint16-LE)
 *   bytes 8.. : packed pixels, 2 px/byte, HIGH nibble = first (left) pixel,
 *               each nibble a palette `.code`. Row-major, no per-row padding.
 */

interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, row-major, length = width*height*4. ArrayBuffer-backed so it can be
   *  handed straight to the `ImageData` constructor. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** code (0-15) → preview RGB, built once from the frozen palette. */
const PREVIEW_BY_CODE: (readonly [number, number, number])[] = (() => {
  const table: (readonly [number, number, number])[] = new Array(16).fill([
    0, 0, 0,
  ]);
  for (const c of PALETTE) table[c.code & 0x0f] = c.preview;
  return table;
})();

/** Decode a PBL1 buffer to RGBA ImageData-like data, or null if not PBL1. */
function decodePbl1(buf: Uint8Array): DecodedImage | null {
  if (buf.length < HEADER_BYTES) return null;
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== MAGIC) return null;

  const width = buf[4] | (buf[5] << 8);
  const height = buf[6] | (buf[7] << 8);
  if (width <= 0 || height <= 0) return null;

  const n = width * height;
  const data = new Uint8ClampedArray(n * 4);
  let o = HEADER_BYTES;
  let hi = true; // next nibble is the HIGH nibble of the current byte
  let byte = 0;
  for (let i = 0; i < n; i++) {
    let code: number;
    if (hi) {
      byte = o < buf.length ? buf[o] : 0;
      code = (byte >> 4) & 0x0f;
      hi = false;
    } else {
      code = byte & 0x0f;
      hi = true;
      o++;
    }
    const [r, g, b] = PREVIEW_BY_CODE[code] ?? [0, 0, 0];
    const p = i * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }
  return { width, height, data };
}

/* ------------------------------------------------------------------ *
 * RGBA → PNG
 * ------------------------------------------------------------------ *
 *
 * Prefer the platform's canvas encoder (OffscreenCanvas in a worker/modern
 * browser, else a <canvas>). When neither has a 2D context — e.g. headless
 * test environments — fall back to a tiny hand-rolled PNG encoder so `bins`
 * is always a real, displayable image/png Blob.
 */

async function imageDataToPng(image: DecodedImage): Promise<Blob> {
  const viaCanvas = await tryCanvasPng(image);
  if (viaCanvas) return viaCanvas;
  return encodePng(image);
}

async function tryCanvasPng(image: DecodedImage): Promise<Blob | null> {
  const imageData = makeImageData(image);
  if (!imageData) return null;

  // OffscreenCanvas (preferred; works off the main thread).
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
        return await canvas.convertToBlob({ type: "image/png" });
      }
    } catch {
      /* fall through to <canvas> / manual encoder */
    }
  }

  // <canvas> on the main thread.
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (blob) return blob;
      }
    } catch {
      /* fall through to manual encoder */
    }
  }
  return null;
}

/** Construct an ImageData if the platform supports it (it isn't always there). */
function makeImageData(image: DecodedImage): ImageData | null {
  try {
    if (typeof ImageData !== "undefined") {
      return new ImageData(image.data, image.width, image.height);
    }
  } catch {
    /* jsdom may expose ImageData but reject construction */
  }
  return null;
}

/**
 * Minimal, dependency-free PNG encoder (8-bit RGBA, no interlace) used when no
 * canvas backend is available. Uses CompressionStream for zlib/DEFLATE when
 * present, else a stored (uncompressed) zlib stream — both are valid PNGs.
 */
async function encodePng(image: DecodedImage): Promise<Blob> {
  const { width, height, data } = image;

  // Filtered raw image data: one filter byte (0 = none) per scanline.
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (stride + 1);
    raw[dst] = 0; // filter type: none
    raw.set(data.subarray(y * stride, y * stride + stride), dst + 1);
  }

  const compressed = await zlibCompress(raw);

  const chunks: Uint8Array[] = [];
  chunks.push(PNG_SIGNATURE);

  // IHDR
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(pngChunk("IHDR", ihdr));
  chunks.push(pngChunk("IDAT", compressed));
  chunks.push(pngChunk("IEND", new Uint8Array(0)));

  return new Blob(chunks as BlobPart[], { type: "image/png" });
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc >>> 0);
  return out;
}

/** zlib-wrap + DEFLATE `raw`, preferring the platform CompressionStream. */
async function zlibCompress(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    try {
      const cs = new CompressionStream("deflate"); // zlib (RFC 1950) framing
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(cs);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      /* fall through to stored deflate */
    }
  }
  return zlibStored(raw);
}

/** A valid zlib stream using only stored (type 0) DEFLATE blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: number[] = [];
  let i = 0;
  do {
    const len = Math.min(0xffff, raw.length - i);
    const last = i + len >= raw.length ? 1 : 0;
    blocks.push(last); // BFINAL in LSB, BTYPE 00
    blocks.push(len & 0xff, (len >> 8) & 0xff);
    blocks.push(~len & 0xff, (~len >> 8) & 0xff);
    for (let j = 0; j < len; j++) blocks.push(raw[i + j]);
    i += len;
  } while (i < raw.length);

  const body = new Uint8Array(blocks);
  const adler = adler32(raw);
  const out = new Uint8Array(2 + body.length + 4);
  out[0] = 0x78; // CMF
  out[1] = 0x01; // FLG (no dict, fastest)
  out.set(body, 2);
  const dv = new DataView(out.buffer);
  dv.setUint32(2 + body.length, adler >>> 0);
  return out;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ *
 * Path helpers
 * ------------------------------------------------------------------ */

/** Case-insensitive prefix test (paths come from varied filesystems/zips). */
function pathStartsWith(path: string, prefix: string): boolean {
  return path.toLowerCase().startsWith(prefix.toLowerCase());
}

/** Find a file by its expected card-relative path, case-insensitively. */
function lookup(files: CardFiles, wanted: string): (() => Promise<Blob>) | null {
  const direct = files.get(wanted);
  if (direct) return direct;
  const lower = wanted.toLowerCase();
  for (const [path, getter] of files) {
    if (path.toLowerCase() === lower) return getter;
  }
  return null;
}

function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function stripExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}
