import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Large codebase pragmatic downgrades — surface as warnings, don't block CI.
      // Full typing pass is tracked as a separate cleanup task.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-console": "warn",
      "no-case-declarations": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-empty-interface": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
    },
  },
  // Guardrails for book routes: friendlyInsertError / FRIENDLY_INSERT_MESSAGES
  // must always come from the canonical module `@/lib/insert-errors`, and must
  // never be redefined locally inside a book route (which is how the previous
  // import conflict slipped in).
  {
    files: [
      "src/routes/book.tsx",
      "src/routes/api/public/book/**/*.{ts,tsx}",
      "src/routes/pharmacy.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              group: ["*insert-errors*", "!@/lib/insert-errors"],
              message:
                "استورد friendlyInsertError / FRIENDLY_INSERT_MESSAGES من '@/lib/insert-errors' فقط — لا تعيد تعريفها أو تستوردها من مسار آخر. راجع docs/book-friendly-insert-error.md",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "VariableDeclarator[id.name='friendlyInsertError'], FunctionDeclaration[id.name='friendlyInsertError'], VariableDeclarator[id.name='FRIENDLY_INSERT_MESSAGES']",
          message:
            "لا تعرّف friendlyInsertError أو FRIENDLY_INSERT_MESSAGES محليًا داخل مسارات insert — استوردهما من '@/lib/insert-errors'. راجع docs/book-friendly-insert-error.md",
        },
        {
          selector:
            "ImportDeclaration[source.value=/insert-errors/]:not([source.value='@/lib/insert-errors'])",
          message:
            "استورد من '@/lib/insert-errors' فقط بدون مسارات نسبية أو مكررة. راجع docs/book-friendly-insert-error.md",
        },
      ],
    },
  },
  eslintPluginPrettier,
  {
    // Bracket-path routes (`[.mcp]`, `[.well-known]`) confuse eslint-plugin-prettier's
    // config resolution — Prettier itself considers them formatted. Disable the
    // in-editor check; the standalone `prettier --check` still guards these files.
    files: [
      "src/routes/mcp.ts",
      "src/routes/[.mcp]/**/*.{ts,tsx}",
      "src/routes/[.well-known]/**/*.{ts,tsx}",
    ],
    rules: { "prettier/prettier": "off" },
  },
);
