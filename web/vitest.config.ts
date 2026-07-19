import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// Solid needs its Vite plugin during tests, plus the 'development'/'browser'
// resolve conditions so reactivity works under Vitest.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
