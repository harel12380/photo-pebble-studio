# Photo Pebble Studio

The browser app that prepares photos for **Photo Pebble** — a small 6-colour
e-ink photo frame I built. The studio crops, colour-maps and dithers images down
to the panel's six-ink palette, then writes a ready-to-boot SD card.

**→ [Open the studio](https://harel12380.github.io/photo-pebble-studio/)**

Everything runs locally in your browser. Photos are read from disk, processed on
a worker thread, and written straight back out — there is no backend, no upload,
no analytics, and no network request of any kind.

## What it does

- **Dithering** — error-diffusion (Floyd–Steinberg and friends), ordered/Bayer,
  and a Hilbert-curve mode, all working in [Oklab](https://bottosson.github.io/posts/oklab/)
  so colour error is perceptually weighted rather than naïvely RGB.
- **Chroma-aware error handling** — lightness error diffuses fully while chroma
  error is damped on neutral pixels, which keeps greys from going blotchy on a
  six-ink palette.
- **Crop & edit** — per-photo framing, palette preview, and a message composer.
- **Card export** — writes the on-card layout the device firmware expects, plus a
  round-trip manifest so a card can be re-imported and edited later.

## Running it locally

```bash
npm ci
npm run dev      # studio at http://localhost:5173
npm test         # 220 tests
npm run build    # static output in web/dist
```

Node 20 or newer. The studio is [SolidJS](https://www.solidjs.com/) + Vite +
TypeScript, with dithering on a worker pool.

## Layout

```
web/      studio UI, dithering engine, card import/export
shared/   the on-card format contract (shared with the device firmware)
```

## Scope

Photo Pebble is a personal project rather than a kit, so this repo is the studio
app and nothing else — no hardware guide, no bill of materials. The dithering
pipeline in `web/src/dither/` is self-contained and may be worth a look on its
own.

## Licence

MIT — see [LICENSE](LICENSE).
