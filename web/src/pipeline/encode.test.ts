import { describe, it, expect } from 'vitest';
import { encodeIndexed4, encodeBmp } from './encode';
import { PALETTE, HEADER_BYTES, indexed4ByteLength } from '../cardFormat';

describe('encodeIndexed4', () => {
  it('writes the "PBL1" magic header followed by little-endian width/height', () => {
    const indices = new Uint8Array([0, 1, 2, 3]); // 2x2
    const out = encodeIndexed4(indices, 2, 2, PALETTE);

    expect(out[0]).toBe(0x50); // 'P'
    expect(out[1]).toBe(0x42); // 'B'
    expect(out[2]).toBe(0x4c); // 'L'
    expect(out[3]).toBe(0x31); // '1'

    // width = 2 -> 0x0002 LE
    expect(out[4]).toBe(2);
    expect(out[5]).toBe(0);
    // height = 2 -> 0x0002 LE
    expect(out[6]).toBe(2);
    expect(out[7]).toBe(0);
  });

  it('encodes width/height > 255 correctly (little-endian, two bytes)', () => {
    const width = 600;
    const height = 400;
    const indices = new Uint8Array(width * height); // all zero (black)
    const out = encodeIndexed4(indices, width, height, PALETTE);

    // 600 = 0x0258 -> LE bytes [0x58, 0x02]
    expect(out[4]).toBe(0x58);
    expect(out[5]).toBe(0x02);
    // 400 = 0x0190 -> LE bytes [0x90, 0x01]
    expect(out[6]).toBe(0x90);
    expect(out[7]).toBe(0x01);

    expect(out).toHaveLength(indexed4ByteLength(width, height));
  });

  it('has total length = HEADER_BYTES + ceil(width*height/2)', () => {
    const indices = new Uint8Array(6); // 3x2
    const out = encodeIndexed4(indices, 3, 2, PALETTE);
    expect(out).toHaveLength(indexed4ByteLength(3, 2));
    expect(out).toHaveLength(HEADER_BYTES + 3); // 6 px -> 3 packed bytes
  });

  it('packs two palette-index pixels per byte, high nibble = first pixel', () => {
    // indices: black(0x0), white(0x1), yellow(0x2), red(0x3)
    const blackIdx = PALETTE.findIndex((c) => c.id === 'black');
    const whiteIdx = PALETTE.findIndex((c) => c.id === 'white');
    const yellowIdx = PALETTE.findIndex((c) => c.id === 'yellow');
    const redIdx = PALETTE.findIndex((c) => c.id === 'red');

    const indices = new Uint8Array([blackIdx, whiteIdx, yellowIdx, redIdx]); // 2x2
    const out = encodeIndexed4(indices, 2, 2, PALETTE);

    // codes: black=0x0, white=0x1, yellow=0x2, red=0x3
    // byte 0: hi=black(0x0), lo=white(0x1) -> 0x01
    expect(out[HEADER_BYTES]).toBe(0x01);
    // byte 1: hi=yellow(0x2), lo=red(0x3) -> 0x23
    expect(out[HEADER_BYTES + 1]).toBe(0x23);
  });

  it('pads the final nibble with 0 for an odd total pixel count', () => {
    const blackIdx = PALETTE.findIndex((c) => c.id === 'black');
    const whiteIdx = PALETTE.findIndex((c) => c.id === 'white');
    const yellowIdx = PALETTE.findIndex((c) => c.id === 'yellow');

    // 3 pixels: black, white, yellow -> 2 packed bytes
    const indices = new Uint8Array([blackIdx, whiteIdx, yellowIdx]);
    const out = encodeIndexed4(indices, 3, 1, PALETTE);

    expect(out).toHaveLength(HEADER_BYTES + 2);
    // byte 0: hi=black(0x0), lo=white(0x1) -> 0x01
    expect(out[HEADER_BYTES]).toBe(0x01);
    // byte 1: hi=yellow(0x2), lo=padding(0x0) -> 0x20
    expect(out[HEADER_BYTES + 1]).toBe(0x20);
  });

  it('uses each palette entry\'s nibble `code`, masked to 4 bits', () => {
    // blue's code is 0x5, green's is 0x6 (per cardFormat docs).
    const blueIdx = PALETTE.findIndex((c) => c.id === 'blue');
    const greenIdx = PALETTE.findIndex((c) => c.id === 'green');
    const indices = new Uint8Array([blueIdx, greenIdx]);
    const out = encodeIndexed4(indices, 2, 1, PALETTE);
    // hi=blue(0x5), lo=green(0x6) -> 0x56
    expect(out[HEADER_BYTES]).toBe(0x56);
  });

  it('handles a 1x1 image (single nibble padded into one byte)', () => {
    const whiteIdx = PALETTE.findIndex((c) => c.id === 'white');
    const indices = new Uint8Array([whiteIdx]);
    const out = encodeIndexed4(indices, 1, 1, PALETTE);
    expect(out).toHaveLength(HEADER_BYTES + 1);
    // hi=white(0x1), lo=padding(0x0) -> 0x10
    expect(out[HEADER_BYTES]).toBe(0x10);
  });
});

describe('encodeBmp', () => {
  it('writes the "BM" signature and a 54-byte header', () => {
    const indices = new Uint8Array(4); // 2x2, all black
    const out = encodeBmp(indices, 2, 2, PALETTE);
    expect(out[0]).toBe(0x42); // 'B'
    expect(out[1]).toBe(0x4d); // 'M'
  });

  it('computes file size = 54 + row-aligned pixel array size', () => {
    const width = 2;
    const height = 2;
    const indices = new Uint8Array(width * height);
    const out = encodeBmp(indices, width, height, PALETTE);

    const rowSize = Math.floor((24 * width + 31) / 32) * 4; // 4-byte aligned
    const expectedSize = 54 + rowSize * height;
    expect(out).toHaveLength(expectedSize);

    const dv = new DataView(out.buffer);
    expect(dv.getUint32(2, true)).toBe(expectedSize); // file size field
    expect(dv.getUint32(10, true)).toBe(54); // pixel data offset
  });

  it('writes correct BITMAPINFOHEADER fields', () => {
    const width = 4;
    const height = 3;
    const indices = new Uint8Array(width * height);
    const out = encodeBmp(indices, width, height, PALETTE);
    const dv = new DataView(out.buffer);

    expect(dv.getUint32(14, true)).toBe(40); // header size
    expect(dv.getInt32(18, true)).toBe(width);
    expect(dv.getInt32(22, true)).toBe(height); // positive = bottom-up
    expect(dv.getUint16(26, true)).toBe(1); // planes
    expect(dv.getUint16(28, true)).toBe(24); // bpp
    expect(dv.getUint32(30, true)).toBe(0); // BI_RGB
  });

  it('writes pixels bottom-up and in BGR order', () => {
    // 1x2 image: row 0 (top) = red, row 1 (bottom) = blue.
    const redIdx = PALETTE.findIndex((c) => c.id === 'red');
    const blueIdx = PALETTE.findIndex((c) => c.id === 'blue');
    const indices = new Uint8Array([redIdx, blueIdx]); // row-major: [top, bottom]
    const out = encodeBmp(indices, 1, 2, PALETTE);

    const rowSize = Math.floor((24 * 1 + 31) / 32) * 4; // = 4
    // BMP row 0 (first in file) is the bottom source row (blue).
    const [br, bg, bb] = PALETTE[blueIdx].rgb;
    expect(out[54]).toBe(bb); // B
    expect(out[55]).toBe(bg); // G
    expect(out[56]).toBe(br); // R

    // BMP row 1 (second in file) is the top source row (red).
    const [rr, rg, rb] = PALETTE[redIdx].rgb;
    expect(out[54 + rowSize]).toBe(rb); // B
    expect(out[54 + rowSize + 1]).toBe(rg); // G
    expect(out[54 + rowSize + 2]).toBe(rr); // R
  });

  it('row size is 4-byte aligned for an odd width', () => {
    const width = 3;
    const height = 1;
    const indices = new Uint8Array(width * height);
    const out = encodeBmp(indices, width, height, PALETTE);
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    expect(rowSize % 4).toBe(0);
    expect(out).toHaveLength(54 + rowSize * height);
  });
});
