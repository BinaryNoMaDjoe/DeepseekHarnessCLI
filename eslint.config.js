import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/lib/**", "**/dist/**", "**/coverage/**", "**/node_modules/**", "_research/**", ".tmp/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["packages/tui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Node entrypoints and scripts: process/console/import.meta are ambient.
    files: ["**/bin/**", "**/*.mjs"],
    rules: { "no-undef": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Bounds checks with noUncheckedIndexedAccess are expressed with "!".
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
