import { defineConfig } from "vitest/config";

export default defineConfig({
  worker: { format: "es" },
  build: { target: "es2022" },
  server: { fs: { allow: [".."] } },
  test: {
    dir: "..",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
