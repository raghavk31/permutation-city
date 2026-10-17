import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    // Two pages: the six chapters (index.html) and the site picker with the layer cake (new.html).
    rolldownOptions: { input: { main: resolve(__dirname, "index.html"), new: resolve(__dirname, "new.html") } },
  },
  server: { fs: { allow: [".."] } },
  // MapLibre loads its own worker by URL; pre-bundling breaks that URL in dev.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: {
    dir: "..",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
