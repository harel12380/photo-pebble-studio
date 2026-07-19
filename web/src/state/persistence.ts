import type { CardConfigSlideshow, Orientation } from '../cardFormat';
import type {
  EditDefaults,
  EditState,
  MessageSpec,
  OutputSettings,
  PhotoSourceKind,
  PreviewColors,
  SortMode,
} from '../types';

/**
 * Local persistence so work survives a refresh / tab close. Photo bytes are
 * stored as Blobs in IndexedDB (localStorage can't hold them and is too small);
 * the lightweight metadata (order, per-photo edits, settings) is stored as one
 * small record. Nothing leaves the device — this is the same local-only model
 * as the rest of the app. Derived data (dither results) is NOT persisted; it's
 * recomputed on load.
 *
 * Every operation is best-effort: if IndexedDB is unavailable (private mode,
 * locked-down browser), the app still works fully — it just won't remember.
 */

const DB_NAME = 'photo-pebble';
const DB_VERSION = 1;
const BLOBS = 'blobs';
const META = 'meta';
const META_KEY = 'state';

export interface PersistedMeta {
  order: string[];
  photos: Record<
    string,
    {
      name: string;
      sourceKind: PhotoSourceKind;
      edit: EditState;
      addedAt?: number;
      modifiedAt?: number;
      takenAt?: number;
      message?: MessageSpec;
      originalExt?: string;
    }
  >;
  settings: {
    orientation: Orientation;
    slideshow: CardConfigSlideshow;
    output: OutputSettings;
    /** All optional for back-compat with sessions saved before these existed. */
    sortMode?: SortMode;
    editDefaults?: EditDefaults;
    chromaWeight?: number;
    previewColors?: PreviewColors;
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function persistenceAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

let persistenceRequested = false;

/**
 * Ask the browser to mark our storage as persistent so IndexedDB can't be
 * silently evicted under disk pressure — the actual cause of "rebooted and lost
 * my work." Best-effort and idempotent: the grant is sticky, the prompt (if any)
 * is the browser's, and we never throw if the API is missing or denied.
 * Resolves to whether storage is now persisted.
 */
export async function requestPersistence(): Promise<boolean> {
  if (persistenceRequested) return false;
  persistenceRequested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false;
    }
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  try {
    await request(BLOBS, 'readwrite', (s) => s.put({ id, blob }));
  } catch {
    /* best-effort */
  }
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await request(BLOBS, 'readwrite', (s) => s.delete(id));
  } catch {
    /* best-effort */
  }
}

export async function clearBlobs(): Promise<void> {
  try {
    await request(BLOBS, 'readwrite', (s) => s.clear());
  } catch {
    /* best-effort */
  }
}

export async function getAllBlobs(): Promise<Map<string, Blob>> {
  try {
    const recs = await request<{ id: string; blob: Blob }[]>(
      BLOBS,
      'readonly',
      (s) => s.getAll(),
    );
    const map = new Map<string, Blob>();
    for (const r of recs) map.set(r.id, r.blob);
    return map;
  } catch {
    return new Map();
  }
}

export async function saveMeta(meta: PersistedMeta): Promise<boolean> {
  try {
    await request(META, 'readwrite', (s) => s.put(meta, META_KEY));
    return true;
  } catch {
    // Best-effort: IndexedDB may be unavailable (private mode). Report failure
    // so callers don't show a misleading "saved".
    return false;
  }
}

export async function getMeta(): Promise<PersistedMeta | null> {
  try {
    const meta = await request<PersistedMeta | undefined>(
      META,
      'readonly',
      (s) => s.get(META_KEY),
    );
    return meta ?? null;
  } catch {
    return null;
  }
}

export async function clearMeta(): Promise<void> {
  try {
    await request(META, 'readwrite', (s) => s.delete(META_KEY));
  } catch {
    /* best-effort */
  }
}
