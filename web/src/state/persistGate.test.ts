import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for "refresh wipes everything even though it said saved":
// the autosave effect runs immediately on module load (empty state) and the
// pagehide flush can fire mid-load, both racing the async hydrate(). Either one
// firing before hydration settles would overwrite the real saved meta with an
// empty one. Persistence must stay gated until hydrate() finishes.

// A tiny in-memory stand-in for the persistence layer so we can observe writes.
const saveMeta = vi.fn(async (_meta: unknown) => true);
const getMeta = vi.fn(async () => null);
const getAllBlobs = vi.fn(async () => new Map());

vi.mock("./persistence", () => ({
  saveMeta,
  getMeta,
  getAllBlobs,
  saveBlob: vi.fn(async () => {}),
  deleteBlob: vi.fn(async () => {}),
  clearBlobs: vi.fn(async () => {}),
  clearMeta: vi.fn(async () => {}),
  requestPersistence: vi.fn(async () => false),
}));

async function freshStore(): Promise<typeof import("./store")> {
  vi.resetModules();
  saveMeta.mockClear();
  getMeta.mockClear();
  getAllBlobs.mockClear();
  return import("./store");
}

beforeEach(() => {
  saveMeta.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("persistence gate", () => {
  it("does not flush before hydration settles", async () => {
    const store = await freshStore();
    // Simulate a refresh firing pagehide while state is still empty/loading.
    store.flushPersist();
    await Promise.resolve();
    expect(saveMeta).not.toHaveBeenCalled();
  });

  it("flushes once hydration has settled", async () => {
    const store = await freshStore();
    await store.hydrate(); // no saved meta -> settles immediately
    store.flushPersist();
    await Promise.resolve();
    expect(saveMeta).toHaveBeenCalled();
  });

  // Guards the DataCloneError that silently dropped every meta write: buildMeta
  // must hand IndexedDB plain, structured-cloneable data — never live Solid
  // store proxies. A settings-only change exercises the proxy'd settings objects
  // (slideshow / output / editDefaults) even with no photos loaded.
  it("autosaved meta is structured-cloneable (no store proxies)", async () => {
    vi.useFakeTimers();
    try {
      const store = await freshStore();
      await store.hydrate();
      store.setPreviewColors("panel");
      await vi.advanceTimersByTimeAsync(500);
      expect(saveMeta).toHaveBeenCalled();
      const meta = saveMeta.mock.calls.at(-1)?.[0];
      expect(() => structuredClone(meta)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
