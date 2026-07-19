import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  HEADER_BYTES,
  MAGIC_BYTES,
  MANIFEST_PATH,
  ORIGINALS_DIR,
  PALETTE,
  PHOTOS_DIR,
  paletteColor,
  type PebbleManifest,
} from "@pebble/shared";
import { parseCard } from "./cardIO";

const PHOTO_ID = "ab12";

/** A minimal valid PBL1 image: 2x2 of black, white, red, blue. */
function makePbl1(): Uint8Array {
  const width = 2;
  const height = 2;
  const codes = [
    paletteColor("black").code,
    paletteColor("white").code,
    paletteColor("red").code,
    paletteColor("blue").code,
  ];
  // 2 px/byte, high nibble = first pixel.
  const body = new Uint8Array(2);
  body[0] = ((codes[0] & 0x0f) << 4) | (codes[1] & 0x0f);
  body[1] = ((codes[2] & 0x0f) << 4) | (codes[3] & 0x0f);

  const out = new Uint8Array(HEADER_BYTES + body.length);
  out.set(MAGIC_BYTES, 0);
  out[4] = width & 0xff;
  out[5] = (width >> 8) & 0xff;
  out[6] = height & 0xff;
  out[7] = (height >> 8) & 0xff;
  out.set(body, HEADER_BYTES);
  return out;
}

function makeManifest(): PebbleManifest {
  return {
    manifestVersion: 1,
    cardFormatVersion: 1,
    generation: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    app: { name: "Photo Pebble", version: "1.0.0" },
    settings: {
      orientation: "landscape",
      sortMode: "taken-desc",
      slideshow: { interval_seconds: 14400, loop: true },
      editDefaults: {} as PebbleManifest["settings"]["editDefaults"],
      chromaWeight: 1,
      storeOriginals: true,
    },
    photos: [
      {
        id: PHOTO_ID,
        binFile: `${PHOTOS_DIR}/000.bin`,
        originalFile: `${ORIGINALS_DIR}/${PHOTO_ID}.png`,
        name: "beach.png",
        sourceKind: "file",
        takenAt: 1_699_999_000_000,
        addedAt: 1_700_000_000_000,
        edit: {} as PebbleManifest["photos"][number]["edit"],
      },
    ],
  };
}

/** Build an in-memory card .zip and hand it back as a File. */
async function buildCardZip(opts?: { withManifest?: boolean }): Promise<File> {
  const withManifest = opts?.withManifest ?? true;
  const zip = new JSZip();
  if (withManifest) {
    zip.file(MANIFEST_PATH, JSON.stringify(makeManifest()));
    zip.file(`${ORIGINALS_DIR}/${PHOTO_ID}.png`, new Uint8Array([1, 2, 3, 4]));
  }
  zip.file(`${PHOTOS_DIR}/000.bin`, makePbl1());
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "card.zip", { type: "application/zip" });
}

/** Read the leading bytes of a Blob (for asserting PNG signature). */
async function head(blob: Blob, n: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}

describe("parseCard (zip source)", () => {
  it("parses manifest, originals, and decodes bins", async () => {
    const file = await buildCardZip();
    const parsed = await parseCard(file);

    // Manifest parsed with the right photo.
    expect(parsed.manifest).not.toBeNull();
    expect(parsed.manifest!.generation).toBe(3);
    expect(parsed.manifest!.photos).toHaveLength(1);
    expect(parsed.manifest!.photos[0].id).toBe(PHOTO_ID);
    expect(parsed.manifest!.photos[0].name).toBe("beach.png");

    // Originals keyed by manifest photo id (filename minus extension).
    expect(parsed.originals.has(PHOTO_ID)).toBe(true);
    const original = parsed.originals.get(PHOTO_ID)!;
    expect(await original.arrayBuffer().then((b) => b.byteLength)).toBe(4);

    // bins: exactly one decoded PNG entry, in filename order.
    expect(parsed.bins).toHaveLength(1);
    expect(parsed.bins[0].name).toBe("000.bin");
    expect(parsed.bins[0].blob.type).toBe("image/png");
    expect(parsed.bins[0].blob.size).toBeGreaterThan(0);
    // Real PNG: starts with the 8-byte PNG signature.
    expect(Array.from(await head(parsed.bins[0].blob, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it("imports a card with no manifest (bins fallback only)", async () => {
    const file = await buildCardZip({ withManifest: false });
    const parsed = await parseCard(file);

    expect(parsed.manifest).toBeNull();
    expect(parsed.originals.size).toBe(0);
    expect(parsed.bins).toHaveLength(1);
    expect(parsed.bins[0].blob.type).toBe("image/png");
  });

  it("is tolerant of an empty archive", async () => {
    const empty = await new JSZip().generateAsync({ type: "blob" });
    const parsed = await parseCard(
      new File([empty], "empty.zip", { type: "application/zip" }),
    );
    expect(parsed.manifest).toBeNull();
    expect(parsed.originals.size).toBe(0);
    expect(parsed.bins).toHaveLength(0);
  });

  it("throws on input that is not a readable archive", async () => {
    const junk = new File([new Uint8Array([0, 1, 2, 3])], "not-a-zip.zip");
    await expect(parseCard(junk)).rejects.toThrow();
  });

  it("sanity: palette has the colors the PBL1 fixture uses", () => {
    // Guards the fixture against palette drift.
    expect(PALETTE.some((c) => c.id === "blue")).toBe(true);
  });
});
