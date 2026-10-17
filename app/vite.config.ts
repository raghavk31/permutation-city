import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// In dev, POST /api/brief runs the same handler as the Vercel function. With no
// OPENROUTER_API_KEY it says so; with BRIEF_REPLAY=<file> it answers with a recorded
// response instead (for working on the brief panel without calling the model).
const devApi: Plugin = {
  name: "dev-api",
  configureServer(server) {
    server.middlewares.use("/api/brief", async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const replay = process.env.BRIEF_REPLAY;
      if (replay) {
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(replay));
        return;
      }
      const { handle } = await server.ssrLoadModule("/brief/compile.ts");
      const { CORPUS } = await server.ssrLoadModule("/api/_corpus.ts");
      const request = new Request(`http://localhost${req.url ?? ""}`, {
        method: req.method, headers: req.headers as Record<string, string>, body: Buffer.concat(chunks),
      });
      const out: Response = await handle(request, CORPUS, { fetch, env: process.env, now: Date.now });
      res.statusCode = out.status;
      res.setHeader("Content-Type", "application/json");
      res.end(await out.text());
    });
  },
};

export default defineConfig({
  plugins: [svelte(), devApi],
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
