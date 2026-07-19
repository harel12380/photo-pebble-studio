/**
 * End-to-end round-trip: export a card the way the studio does, then read it
 * back with parseCard and assert nothing is lost. This is the keystone of the
 * "bring the card back later and keep editing" promise — it exercises the real
 * export packer (buildZipBlob), the real PBL1 encoder (encodeIndexed4), the
 * real manifest schema, and the real importer (parseCard) against each other.
 */
import { describe, it, expect } from "vitest";
import {
  CARD_FORMAT_VERSION,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  ORIGINALS_DIR,
  PALETTE,
  defaultEditState,
  displaySize,
  originalPath,
  photoPath,
  type CardConfig,
  type PebbleManifest,
} from "@pebble/shared";
import { buildZipBlob, type BundleFile } from "../pipeline/bundle";
import { encodeIndexed4 } from "../pipeline/encode";
import { parseCard } from "../state/cardIO";

function makeIndices(w: number, h: number, seed: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = (i + seed) % PALETTE.length;
  return a;
}

// Encode text to bytes, re-wrapped in this realm's Uint8Array. jsdom's
// TextEncoder returns a Uint8Array from a different JS realm, which JSZip's
// cross-realm `instanceof Uint8Array` check rejects; the browser has one realm,
// so this is purely a test-environment normalization.
function enc(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

describe("card export → import round-trip", () => {
  it("restores the manifest, order, edits, and originals from an exported zip", async () => {
    const orientation = "landscape" as const;
    const { width, height } = displaySize(orientation);

    // Two items, the way the store would hold them after editing.
    const items = [
      { id: "alpha", name: "first.jpg", ext: "jpg", takenAt: 2000, original: "AAAA" },
      { id: "beta", name: "second.jpg", ext: "jpg", takenAt: 1000, original: "BBBBBB" },
    ];

    // --- Export side: build exactly what store.exportBundle assembles ---
    const files: BundleFile[] = [];
    items.forEach((_item, i) => {
      const indices = makeIndices(width, height, i);
      files.push({ path: photoPath(i, "indexed4"), bytes: encodeIndexed4(indices, width, height, PALETTE) });
    });

    const manifest: PebbleManifest = {
      manifestVersion: MANIFEST_VERSION,
      cardFormatVersion: CARD_FORMAT_VERSION,
      generation: 3,
      createdAt: 111,
      updatedAt: 222,
      app: { name: "Photo Pebble", version: "1.0.0" },
      settings: {
        orientation,
        sortMode: "taken-desc",
        slideshow: { interval_seconds: 14400, loop: true, quiet_hours: null },
        editDefaults: {
          algorithm: "floyd-steinberg",
          ditherStrength: 100,
          serpentine: true,
          orderedMatrix: "blue-noise",
          cropMode: "fill",
          background: { type: "blur", color: [255, 255, 255] },
        },
        chromaWeight: 3,
        storeOriginals: true,
      },
      photos: items.map((it, i) => ({
        id: it.id,
        binFile: photoPath(i, "indexed4"),
        originalFile: originalPath(it.id, it.ext),
        name: it.name,
        sourceKind: "file" as const,
        takenAt: it.takenAt,
        addedAt: 500,
        edit: { ...defaultEditState(), brightness: i === 0 ? 20 : -10 },
      })),
    };
    files.push({
      path: MANIFEST_PATH,
      bytes: enc(JSON.stringify(manifest)),
    });
    for (const it of items) {
      files.push({ path: `${ORIGINALS_DIR}/${it.id}.${it.ext}`, bytes: enc(it.original) });
    }

    const config: CardConfig = {
      version: CARD_FORMAT_VERSION,
      display: { width, height, format: "indexed4" },
      slideshow: manifest.settings.slideshow,
      card_id: 12345,
      photos: items.map((it, i) => ({ file: photoPath(i, "indexed4"), name: it.name })),
    };

    const zipBlob = await buildZipBlob(config, files);
    const zipFile = new File([zipBlob], "card.zip", { type: "application/zip" });

    // --- Import side: read it back ---
    const parsed = await parseCard(zipFile);

    // Manifest + global settings survive verbatim.
    expect(parsed.manifest).not.toBeNull();
    expect(parsed.manifest!.generation).toBe(3);
    expect(parsed.manifest!.settings.sortMode).toBe("taken-desc");
    expect(parsed.manifest!.settings.slideshow.interval_seconds).toBe(14400);

    // Order + per-photo edits survive.
    expect(parsed.manifest!.photos.map((p) => p.id)).toEqual(["alpha", "beta"]);
    expect(parsed.manifest!.photos[0].edit.brightness).toBe(20);
    expect(parsed.manifest!.photos[1].edit.brightness).toBe(-10);
    expect(parsed.manifest!.photos[1].takenAt).toBe(1000);

    // Originals come back, keyed by id, with the right bytes.
    expect(parsed.originals.has("alpha")).toBe(true);
    expect(parsed.originals.has("beta")).toBe(true);
    expect(await parsed.originals.get("alpha")!.text()).toBe("AAAA");
    expect(await parsed.originals.get("beta")!.text()).toBe("BBBBBB");

    // And the firmware-facing bins are present and decodable as a fallback.
    expect(parsed.bins.length).toBe(2);
    expect(parsed.bins[0].name).toBe("000.bin");
  });
});
