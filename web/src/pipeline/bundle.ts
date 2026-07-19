import JSZip from 'jszip';
import {
  CONFIG_FILENAME,
  CLOCK_FILENAME,
  PHOTOS_DIR,
  formatClockStamp,
  type CardConfig,
} from '../cardFormat';

/**
 * Output stage: take a built config + the encoded photo files and either zip
 * them for download (works everywhere) or write them straight into a chosen
 * folder via the File System Access API (Chrome/Edge — e.g. the mounted SD card).
 */

export interface BundleFile {
  /** Card-relative path, e.g. "photos/000.bin". */
  path: string;
  bytes: Uint8Array;
}

function configBytes(config: CardConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(config, null, 2));
}

export async function buildZipBlob(
  config: CardConfig,
  files: BundleFile[],
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(CONFIG_FILENAME, JSON.stringify(config, null, 2));
  for (const f of files) zip.file(f.path, f.bytes);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Whether "write directly to a folder" is available in this browser. */
export function directoryWriteSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function writeFileInDir(
  root: FileSystemDirectoryHandle,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const parts = path.split('/');
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  // `as BufferSource` keeps TS happy across DOM lib versions.
  await writable.write(bytes as unknown as BufferSource);
  await writable.close();
}

/**
 * Remove photos/*.bin files that are not part of the new export. Without this,
 * shrinking a slideshow leaves the old higher-numbered files on the card and
 * the firmware (which enumerates the directory) keeps showing deleted photos.
 * Only firmware-consumed .bin files inside photos/ are touched — everything
 * else on the card (incl. the firmware-owned pebble.state resume file at the
 * root, see cardFormat.ts) is deliberately left alone.
 */
async function pruneStalePhotos(
  root: FileSystemDirectoryHandle,
  files: BundleFile[],
): Promise<void> {
  let photosDir: FileSystemDirectoryHandle;
  try {
    photosDir = await root.getDirectoryHandle(PHOTOS_DIR);
  } catch {
    return; // no photos dir yet — nothing stale
  }
  const keep = new Set(
    files
      .filter((f) => f.path.startsWith(`${PHOTOS_DIR}/`))
      .map((f) => f.path.slice(PHOTOS_DIR.length + 1)),
  );
  const stale: string[] = [];
  // Async-iteration members are missing from older DOM lib versions (same
  // reason writeFileInDir casts its write payload).
  const entries = (photosDir as unknown as {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries();
  for await (const [name, handle] of entries) {
    // .bin (product) and .bmp (debug exports) are both ours; anything else in
    // photos/ is foreign and left alone.
    const ours = name.endsWith('.bin') || name.endsWith('.bmp');
    if (handle.kind === 'file' && ours && !keep.has(name)) {
      stale.push(name);
    }
  }
  for (const name of stale) {
    await photosDir.removeEntry(name);
  }
}

/**
 * Prompt for a directory and write config.json + all photo files into it,
 * then prune stale photo binaries so the card exactly matches this export.
 * Returns the chosen directory's name. Throws AbortError if the user cancels.
 */
export async function writeBundleToDirectory(
  config: CardConfig,
  files: BundleFile[],
): Promise<string> {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API not supported in this browser.');
  }
  const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  await writeFileInDir(dir, CONFIG_FILENAME, configBytes(config));
  for (const f of files) {
    await writeFileInDir(dir, f.path, f.bytes);
  }
  await pruneStalePhotos(dir, files);
  return dir.name;
}

/**
 * Deliberately set the frame's wall clock: prompt for the card folder and drop a
 * single fresh `clock.txt` (the firmware reads it on next boot, sets the DS3231,
 * then deletes it).
 *
 * This is intentionally NOT part of a normal photo export. Bundling clock.txt
 * into every card would silently reset an already-correct, coin-cell-backed clock
 * to a build-time-stale stamp on each card swap; making it an explicit one-tap
 * action means the user only resets the clock when they actually mean to (e.g. a
 * brand-new frame, or one whose coin cell was changed).
 *
 * Returns the chosen directory's name. Throws AbortError if the user cancels.
 */
export async function syncClockToDirectory(): Promise<string> {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API not supported in this browser.');
  }
  const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  await writeFileInDir(
    dir,
    CLOCK_FILENAME,
    new TextEncoder().encode(formatClockStamp(new Date())),
  );
  return dir.name;
}
