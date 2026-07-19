/**
 * Minimal EXIF reader: extracts the capture time (DateTimeOriginal) from a JPEG.
 * No dependencies; reads only the start of the file where EXIF lives. Returns an
 * epoch-ms timestamp, or undefined if not a JPEG / no date present.
 */
export async function readTakenAt(blob: Blob): Promise<number | undefined> {
  try {
    const buf = await blob.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined; // not JPEG

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) break;
      if (marker === 0xffda) break; // start of scan — metadata is done
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1) {
        const exif = offset + 4;
        // "Exif\0\0"
        if (
          exif + 6 <= view.byteLength &&
          view.getUint32(exif) === 0x45786966 &&
          view.getUint16(exif + 4) === 0x0000
        ) {
          return parseTiff(view, exif + 6);
        }
      }
      offset += 2 + size;
    }
  } catch {
    /* ignore malformed EXIF */
  }
  return undefined;
}

function parseTiff(view: DataView, tiff: number): number | undefined {
  const le = view.getUint16(tiff) === 0x4949; // 'II' little-endian, 'MM' big
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  if (u16(tiff + 2) !== 0x002a) return undefined;

  const readAscii = (entry: number): string => {
    const count = u32(entry + 4);
    const at = count > 4 ? tiff + u32(entry + 8) : entry + 8;
    let s = '';
    for (let i = 0; i < count && at + i < view.byteLength; i++) {
      const c = view.getUint8(at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const ifd0 = tiff + u32(tiff + 4);
  let exifPtr = 0;
  let dateTime = '';
  const count0 = u16(ifd0);
  for (let i = 0; i < count0; i++) {
    const e = ifd0 + 2 + i * 12;
    const tag = u16(e);
    if (tag === 0x8769) exifPtr = tiff + u32(e + 8);
    else if (tag === 0x0132) dateTime = readAscii(e);
  }

  let original = '';
  let digitized = '';
  if (exifPtr && exifPtr + 2 <= view.byteLength) {
    const countE = u16(exifPtr);
    for (let i = 0; i < countE; i++) {
      const e = exifPtr + 2 + i * 12;
      const tag = u16(e);
      if (tag === 0x9003) original = readAscii(e);
      else if (tag === 0x9004) digitized = readAscii(e);
    }
  }

  const str = original || digitized || dateTime;
  return str ? exifDateToMs(str) : undefined;
}

function exifDateToMs(s: string): number | undefined {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const t = new Date(
    +m[1],
    +m[2] - 1,
    +m[3],
    +m[4],
    +m[5],
    +m[6],
  ).getTime();
  return Number.isNaN(t) ? undefined : t;
}
