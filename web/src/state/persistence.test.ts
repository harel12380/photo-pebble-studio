import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPersistence } from "./persistence";

// requestPersistence() is module-level idempotent: it self-disables after the
// first call so the browser isn't re-prompted. We reset the module between tests
// to exercise each branch from a clean slate.
async function freshRequest(): Promise<typeof requestPersistence> {
  vi.resetModules();
  const mod = await import("./persistence");
  return mod.requestPersistence;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestPersistence", () => {
  it("returns false and never throws when the Storage API is missing", async () => {
    const req = await freshRequest();
    vi.stubGlobal("navigator", {} as Navigator);
    await expect(req()).resolves.toBe(false);
  });

  it("skips persist() when storage is already persisted", async () => {
    const req = await freshRequest();
    const persist = vi.fn();
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(true), persist },
    } as unknown as Navigator);
    await expect(req()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence when not yet persisted", async () => {
    const req = await freshRequest();
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(false), persist },
    } as unknown as Navigator);
    await expect(req()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("is idempotent — only the first call hits the API", async () => {
    const req = await freshRequest();
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(false), persist },
    } as unknown as Navigator);
    await req();
    await req();
    expect(persist).toHaveBeenCalledOnce();
  });

  it("swallows rejections from the Storage API", async () => {
    const req = await freshRequest();
    vi.stubGlobal("navigator", {
      storage: {
        persisted: vi.fn().mockRejectedValue(new Error("denied")),
        persist: vi.fn(),
      },
    } as unknown as Navigator);
    await expect(req()).resolves.toBe(false);
  });
});
