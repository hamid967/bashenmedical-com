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
      // Standalone runner scripts (call process.exit / have no describe block) —
      // executed directly by `bun <file>` in a separate CI step, not by vitest.
      "tests/unit/book-docs-keys.test.ts",
      "tests/unit/booking-share-timezone.test.ts",
      "tests/unit/booking-share-preview-parity.test.ts",
      "tests/unit/download-error.test.ts",
      "tests/unit/reason.test.ts",
      "tests/unit/release-gate.test.ts",
      "**/node_modules/**",
    ],
    environment: "node",
    reporters: ["default"],
    passWithNoTests: false,
  },
});
