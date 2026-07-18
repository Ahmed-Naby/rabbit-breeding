import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside a React Server Components bundle; the
      // modules under test (settings.ts, breeds.ts) import it purely as a
      // build-time guard, so an empty stub is the correct test-time shape.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // All tests share the single rabbittrack_test database and truncate it
    // between tests — parallel files would race each other's resets.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
