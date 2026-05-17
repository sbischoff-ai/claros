import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },

  // ── TypeScript / JavaScript files ─────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Unused vars: warn and allow underscore-prefixed names to be ignored
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Catch obvious correctness issues
      "no-unreachable": "error",
      // Disable base rule; the TS-aware version handles this
      "no-unused-vars": "off",
    },
  },

  // ── Svelte files ──────────────────────────────────────────────────────────
  {
    files: ["**/*.svelte"],
    plugins: { svelte },
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      ...svelte.configs.recommended.rules,
    },
  }
);
