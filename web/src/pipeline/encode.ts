import {
  HEADER_BYTES,
  MAGIC_BYTES,
  indexed4ByteLength,
  type PaletteColor,
} from '../cardFormat';

/**
 * Encoders that turn palette indices (one byte per pixel, 0..palette.length-1)
 * into on-card bytes. `indexed4` is the real output; `bmp` is a 24-bit debug
 * format for previewing on a PC. Both consume the SAME palette so colors match.
 */

/** Encode to the `indexed4` ("PBL1") format. See cardFormat.ts for the spec. */
export function encodeIndexed4(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: readonly PaletteColor[],
): Uint8Array {
  const out = new Uint8Array(indexed4ByteLength(width, height));

  out[0] = MAGIC_BYTES[0];
  out[1] = MAGIC_BYTES[1];
  out[2] = MAGIC_BYTES[2];
  out[3] = MAGIC_BYTES[3];
  out[4] = width & 0xff;
  out[5] = (width >> 8) & 0xff;
  out[6] = height & 0xff;
  out[7] = (height >> 8) & 0xff;

  // index -> 4-bit native color code lookup
  const codes = new Uint8Array(palette.length);
  for (let i = 0; i < palette.length; i++) codes[i] = palette[i].code & 0x0f;

  const n = width * height;
  let o = HEADER_BYTES;
  for (let i = 0; i < n; i += 2) {
    const hi = codes[indices[i]] ?? 0;
    const lo = i + 1 < n ? (codes[indices[i + 1]] ?? 0) : 0;
    out[o++] = (hi << 4) | lo;
  }
  return out;
}

/** Encode to an uncompressed 24-bit BMP (bottom-up). Debug/preview only. */
export function encodeBmp(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: readonly PaletteColor[],
): Uint8Array {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4; // 4-byte aligned
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const out = new Uint8Array(fileSize);
  const dv = new DataView(out.buffer);

  // BITMAPFILEHEADER (14 bytes)
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  dv.setUint32(2, fileSize, true);
  dv.setUint32(6, 0, true);
  dv.setUint32(10, 54, true); // pixel data offset

  // BITMAPINFOHEADER (40 bytes)
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true); // positive => bottom-up
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 24, true); // bits per pixel
  dv.setUint32(30, 0, true); // BI_RGB (no compression)
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 2835, true); // 72 DPI
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 0, true);
  dv.setUint32(50, 0, true);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP is stored bottom-up
    let o = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = palette[indices[srcY * width + x]]?.rgb ?? [0, 0, 0];
      out[o++] = b;
      out[o++] = g;
      out[o++] = r;
    }
  }
  return out;
}
