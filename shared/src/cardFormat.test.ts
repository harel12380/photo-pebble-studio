import { describe, it, expect } from "vitest";
import {
  CARD_FORMAT_VERSION,
  PANEL_NATIVE,
  DEFAULT_ORIENTATION,
  displaySize,
  PALETTE,
  PALETTE_RGB,
  PREVIEW_RGB,
  BACKGROUND_RGB,
  MAGIC,
  MAGIC_BYTES,
  HEADER_BYTES,
  indexed4ByteLength,
  fileExtension,
  photoBasename,
  photoPath,
  paletteIndex,
  DEFAULT_SLIDESHOW,
  AUTO_ADVANCE_OFF,
  formatClockStamp,
} from "./cardFormat";

describe("displaySize", () => {
  it("returns landscape dimensions (long x short)", () => {
    expect(displaySize("landscape")).toEqual({ width: 600, height: 400 });
  });

  it("returns portrait dimensions (short x long)", () => {
    expect(displaySize("portrait")).toEqual({ width: 400, height: 600 });
  });

  it("matches the default orientation", () => {
    expect(DEFAULT_ORIENTATION).toBe("landscape");
    expect(displaySize(DEFAULT_ORIENTATION)).toEqual({ width: 600, height: 400 });
  });

  it("is derived from PANEL_NATIVE", () => {
    const { width, height } = displaySize("landscape");
    expect(width * height).toBe(PANEL_NATIVE.width * PANEL_NATIVE.height);
  });
});

describe("PALETTE", () => {
  it("has exactly 6 colors (Spectra-6)", () => {
    expect(PALETTE).toHaveLength(6);
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(PALETTE)).toBe(true);
  });

  it("has the expected ids in order", () => {
    expect(PALETTE.map((c) => c.id)).toEqual([
      "black",
      "white",
      "yellow",
      "red",
      "blue",
      "green",
    ]);
  });

  it("has unique on-wire nibble codes, each within 0-15", () => {
    const codes = PALETTE.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(15);
    }
  });

  it("matches the documented EPD_4in0e nibble codes", () => {
    const byId = new Map(PALETTE.map((c) => [c.id, c.code]));
    expect(byId.get("black")).toBe(0x0);
    expect(byId.get("white")).toBe(0x1);
    expect(byId.get("yellow")).toBe(0x2);
    expect(byId.get("red")).toBe(0x3);
    expect(byId.get("blue")).toBe(0x5);
    expect(byId.get("green")).toBe(0x6);
  });

  it("has rgb and preview triples with byte-range channel values", () => {
    for (const c of PALETTE) {
      for (const channel of [...c.rgb, ...c.preview]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("paletteIndex maps ids to their array position", () => {
    expect(paletteIndex("black")).toBe(0);
    expect(paletteIndex("white")).toBe(1);
    expect(paletteIndex("green")).toBe(5);
  });
});

describe("PALETTE_RGB / PREVIEW_RGB", () => {
  it("have one entry per palette color, in the same order", () => {
    expect(PALETTE_RGB).toHaveLength(PALETTE.length);
    expect(PREVIEW_RGB).toHaveLength(PALETTE.length);
    expect(PALETTE_RGB).toEqual(PALETTE.map((c) => c.rgb));
    expect(PREVIEW_RGB).toEqual(PALETTE.map((c) => c.preview));
  });
});

describe("BACKGROUND_RGB", () => {
  it("is the white palette entry rgb", () => {
    const white = PALETTE.find((c) => c.id === "white");
    expect(BACKGROUND_RGB).toEqual(white?.rgb);
    expect(BACKGROUND_RGB).toEqual([255, 255, 255]);
  });
});

describe("indexed4 binary format constants", () => {
  it('MAGIC and MAGIC_BYTES agree ("PBL1")', () => {
    expect(MAGIC).toBe("PBL1");
    expect(MAGIC_BYTES).toEqual([0x50, 0x42, 0x4c, 0x31]);
    expect(MAGIC_BYTES.map((b) => String.fromCharCode(b)).join("")).toBe(MAGIC);
  });

  it("HEADER_BYTES is 8", () => {
    expect(HEADER_BYTES).toBe(8);
  });
});

describe("indexed4ByteLength", () => {
  it("is header + ceil(width*height/2) for even pixel counts", () => {
    // 600x400 = 240000 px -> 120000 packed bytes + 8 header bytes
    expect(indexed4ByteLength(600, 400)).toBe(HEADER_BYTES + 120000);
  });

  it("rounds up for an odd total pixel count", () => {
    expect(indexed4ByteLength(3, 3)).toBe(HEADER_BYTES + 5);
  });

  it("handles a 1x1 image (single nibble, padded to one byte)", () => {
    expect(indexed4ByteLength(1, 1)).toBe(HEADER_BYTES + 1);
  });

  it("handles zero-size input", () => {
    expect(indexed4ByteLength(0, 0)).toBe(HEADER_BYTES);
  });
});

describe("fileExtension", () => {
  it("maps indexed4 -> bin", () => {
    expect(fileExtension("indexed4")).toBe("bin");
  });

  it("maps bmp -> bmp", () => {
    expect(fileExtension("bmp")).toBe("bmp");
  });
});

describe("photoBasename", () => {
  it("zero-pads to 3 digits", () => {
    expect(photoBasename(0)).toBe("000");
    expect(photoBasename(1)).toBe("001");
    expect(photoBasename(42)).toBe("042");
  });

  it("does not truncate indices >= 1000", () => {
    expect(photoBasename(1000)).toBe("1000");
  });
});

describe("photoPath", () => {
  it("builds a card-relative path for indexed4", () => {
    expect(photoPath(0, "indexed4")).toBe("photos/000.bin");
  });

  it("builds a card-relative path for bmp", () => {
    expect(photoPath(7, "bmp")).toBe("photos/007.bmp");
  });
});

describe("DEFAULT_SLIDESHOW", () => {
  it("is looping, with a multi-hour interval and a quiet window", () => {
    expect(DEFAULT_SLIDESHOW.loop).toBe(true);
    expect(DEFAULT_SLIDESHOW.interval_seconds).toBeGreaterThan(0);
    expect(DEFAULT_SLIDESHOW.quiet_hours).toEqual({ start: "23:00", end: "07:00" });
  });

  it("uses 0 as the buttons-only sentinel", () => {
    expect(AUTO_ADVANCE_OFF).toBe(0);
  });
});

describe("CARD_FORMAT_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(CARD_FORMAT_VERSION)).toBe(true);
    expect(CARD_FORMAT_VERSION).toBeGreaterThan(0);
  });
});

describe("formatClockStamp", () => {
  it("formats local time as the firmware-expected YYYY-MM-DD HH:MM:SS", () => {
    // Local-time fields, zero-padded; month is 1-based.
    const d = new Date(2026, 0, 5, 9, 3, 7); // 2026-01-05 09:03:07 local
    expect(formatClockStamp(d)).toBe("2026-01-05 09:03:07");
  });

  it("matches the firmware sscanf pattern at boundaries", () => {
    const s = formatClockStamp(new Date(2026, 11, 31, 23, 59, 59));
    expect(s).toBe("2026-12-31 23:59:59");
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

/* ------------------------------------------------------------------ *
 * buildCardConfig <-> firmware read_config() contract
 * ------------------------------------------------------------------ *
 *
 * The firmware parses config.json with a tolerant strstr scanner over the
 * FIRST 4 KB (firmware/photo-pebble.cpp read_config).  This emulation mirrors
 * that scanner so tests can prove that whatever buildCardConfig serializes is
 * read back with the intended values — including hostile photo names like
 * "random_beach.jpg" that would confuse a naive scan if key order regressed.
 * If read_config changes, update this emulation in the same commit.
 */
import {
  buildCardConfig,
  freshCardId,
  toCardId,
  MAX_PHOTOS,
  type CardConfigPhoto,
} from "./cardFormat";

function firmwareParse(json: string) {
  const buf = json.slice(0, 4095); // firmware reads sizeof(buf)-1 = 4095 bytes
  const out = {
    interval_s: 14400,
    loop: true,
    quiet: false as boolean,
    quiet_start: "23:00",
    quiet_end: "07:00",
    card_id: 0,
    intro_index: -1,
  };

  let p = buf.indexOf("interval_seconds");
  if (p >= 0) {
    const c = buf.indexOf(":", p);
    if (c >= 0) {
      const v = parseInt(buf.slice(c + 1), 10); // atol semantics
      if (v >= 0) out.interval_s = v;
    }
  }

  p = buf.indexOf('"card_id"');
  if (p >= 0) {
    const c = buf.indexOf(":", p);
    if (c >= 0) {
      const v = parseInt(buf.slice(c + 1), 10);
      if (v > 0) out.card_id = v >>> 0;
    }
  }

  p = buf.indexOf('"intro_index"');
  if (p >= 0) {
    const c = buf.indexOf(":", p);
    if (c >= 0) {
      const v = parseInt(buf.slice(c + 1), 10);
      if (v >= 0) out.intro_index = v;
    }
  }

  p = buf.indexOf('"loop"');
  if (p >= 0) {
    const tr = buf.indexOf("true", p + 6);
    const fa = buf.indexOf("false", p + 6);
    out.loop = !(fa >= 0 && (tr < 0 || fa < tr));
  }

  p = buf.indexOf("quiet_hours");
  if (p >= 0) {
    const colon = buf.indexOf(":", p);
    const nul = colon >= 0 ? buf.indexOf("null", colon) : -1;
    const brace = colon >= 0 ? buf.indexOf("{", colon) : -1;
    if (brace >= 0 && (nul < 0 || brace < nul)) {
      const grab = (key: string): string | null => {
        let s = buf.indexOf(`"${key}"`, brace);
        if (s < 0) return null;
        s = buf.indexOf(":", s);
        if (s < 0) return null;
        const q = buf.indexOf('"', s);
        if (q < 0) return null;
        const m = /^(\d{1,2}):(\d{1,2})/.exec(buf.slice(q + 1));
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (hh > 23 || mm > 59) return null;
        return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
      };
      const s = grab("start");
      const e = grab("end");
      if (s !== null && e !== null) {
        out.quiet = true;
        out.quiet_start = s;
        out.quiet_end = e;
      }
    }
  }
  return out;
}

describe("buildCardConfig -> firmware parser contract", () => {
  const display = { width: 600, height: 400, format: "indexed4" } as const;
  const hostileNames: CardConfigPhoto[] = [
    { file: "photos/000.bin", name: "random_beach.jpg" },
    { file: "photos/001.bin", name: "true_story sequential.png" },
    { file: "photos/002.bin", name: "false alarm null {order}.jpeg" },
  ];
  const serialize = (c: ReturnType<typeof buildCardConfig>) =>
    JSON.stringify(c, null, 2);

  it("keeps the slideshow/card keys ahead of the photos array (contractual order)", () => {
    const json = serialize(
      buildCardConfig(display, DEFAULT_SLIDESHOW, hostileNames, 0xdeadbeef, 1),
    );
    for (const key of [
      '"interval_seconds"',
      '"loop"',
      '"quiet_hours"',
      '"card_id"',
      '"intro_index"',
    ]) {
      expect(json.indexOf(key)).toBeGreaterThanOrEqual(0);
      expect(json.indexOf(key)).toBeLessThan(json.indexOf('"photos"'));
    }
  });

  it("keeps all slideshow/card keys inside the firmware's 4 KB read window at MAX_PHOTOS", () => {
    const many: CardConfigPhoto[] = Array.from({ length: MAX_PHOTOS }, (_, i) => ({
      file: `photos/${String(i).padStart(3, "0")}.bin`,
      name: `photo-${i}-random-true-null.jpg`,
    }));
    const json = serialize(
      buildCardConfig(display, DEFAULT_SLIDESHOW, many, 0xdeadbeef, MAX_PHOTOS - 1),
    );
    expect(json.indexOf('"quiet_hours"')).toBeLessThan(4095);
    expect(json.indexOf('"loop"')).toBeLessThan(4095);
    expect(json.indexOf('"card_id"')).toBeLessThan(4095);
    expect(json.indexOf('"intro_index"')).toBeLessThan(4095);
  });

  it("round-trips loop + quiet hours + card_id despite hostile photo names", () => {
    const cfg = buildCardConfig(
      display,
      { interval_seconds: 3600, loop: true, quiet_hours: { start: "22:30", end: "06:15" } },
      hostileNames,
      12345,
      2,
    );
    const got = firmwareParse(serialize(cfg));
    expect(got).toMatchObject({
      interval_s: 3600,
      loop: true,
      quiet: true,
      quiet_start: "22:30",
      quiet_end: "06:15",
      card_id: 12345,
      intro_index: 2,
    });
  });

  it("round-trips no-loop + quiet null + no intro", () => {
    const cfg = buildCardConfig(
      display,
      { interval_seconds: 0, loop: false, quiet_hours: null },
      hostileNames,
      7,
    );
    const got = firmwareParse(serialize(cfg));
    expect(got).toMatchObject({
      interval_s: 0,
      loop: false,
      quiet: false,
      card_id: 7,
      intro_index: -1,
    });
  });

  it("round-trips omitted quiet_hours as disabled", () => {
    const cfg = buildCardConfig(
      display,
      { interval_seconds: 86400, loop: true },
      hostileNames,
      42,
    );
    const got = firmwareParse(serialize(cfg));
    expect(got).toMatchObject({ interval_s: 86400, quiet: false });
  });

  it("drops an out-of-range intro_index and stray slideshow keys", () => {
    const dirty = {
      interval_seconds: 3600,
      loop: true,
      order: "sequential", // stray key from an old persisted session
    } as unknown as Parameters<typeof buildCardConfig>[1];
    const json = serialize(buildCardConfig(display, dirty, hostileNames, 9, 99));
    expect(json).not.toContain('"order"');
    expect(json).not.toContain('"intro_index"');
  });

  it("never emits card_id 0 and freshCardId is non-zero", () => {
    expect(toCardId(0)).toBe(1);
    expect(toCardId(0x1_0000_0000)).toBe(1); // wraps to 0 -> nudged
    for (let i = 0; i < 32; i++) expect(freshCardId()).toBeGreaterThan(0);
  });
});
