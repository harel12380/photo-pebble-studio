import { defineConfig } from "vite";
import { resolve } from "node:path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// `base: './'` keeps asset URLs relative so the built site works from any
// subpath (Cloudflare Pages, GitHub Pages project sites, or a local folder).
export default defineConfig({
  base: "./",
  plugins: [solid(), tailwindcss()],
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      // Two entries: the studio app (dist/index.html) and the Hebrew promo /
      // "gift" landing page (dist/landing/index.html), reachable via QR at
      // <site>/landing/. Both ship in the single `web/dist` Pages artifact.
      input: {
        main: resolve(__dirname, "index.html"),
        landing: resolve(__dirname, "landing/index.html"),
      },
    },
  },
});
