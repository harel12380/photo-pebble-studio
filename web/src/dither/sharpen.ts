/**
 * Unsharp mask, applied to the panel-resolution RGBA buffer before dithering.
 * Dithering and the small panel soften fine detail; a light sharpen restores edge
 * crispness so the dither reads as detail rather than mush. CSS filters have no
 * unsharp mask, so we do it here on the raw pixels.
 *
 * out = clamp(orig + amount * (orig − blur)), where `blur` is a 3×3 Gaussian
 * (≈1px radius). `amount` is 0..~1 (research recommends ≈0.5). Alpha is untouched.
 */
export function unsharpMask(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0) return;
  const n = width * height;
  const tmp = new Float32Array(n * 3); // horizontal pass
  const blur = new Float32Array(n * 3); // vertical pass

  // Separable [1 2 1] / 4 blur, edge-clamped.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const xm = x > 0 ? i - 1 : i;
      const xp = x < width - 1 ? i + 1 : i;
      for (let c = 0; c < 3; c++) {
        tmp[i * 3 + c] =
          (px[xm * 4 + c] + 2 * px[i * 4 + c] + px[xp * 4 + c]) / 4;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const ym = y > 0 ? row - width : row;
    const yp = y < height - 1 ? row + width : row;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      for (let c = 0; c < 3; c++) {
        blur[i * 3 + c] =
          (tmp[(ym + x) * 3 + c] + 2 * tmp[i * 3 + c] + tmp[(yp + x) * 3 + c]) /
          4;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const o = px[i * 4 + c];
      const v = o + amount * (o - blur[i * 3 + c]);
      px[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}
