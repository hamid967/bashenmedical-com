import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest configuration used by the "test:vitest" CI job to guarantee
// consistent unit-test results across environments (bun / node / CI runners).
// We alias `bun:test` → `vitest` so existing tests that import from bun:test
// (describe/test/expect/beforeAll/afterEach) run unchanged under vitest.
export default defineConfig({
  resolve: {
    alias: {
      "bun:test": "vitest",
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: [
      "tests/unit/book-docs-keys.test.ts", // runner script, not a spec file
      "**/node_modules/**",
    ],
    environment: "node",
    reporters: ["default"],
    passWithNoTests: false,
  },
});
