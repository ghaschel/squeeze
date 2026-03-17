// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
      prettier: eslintPluginPrettier,
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Add your custom rules here
      "@typescript-eslint/no-unused-vars": "off", // Turned off in favor of unused-imports
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "prettier/prettier": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".versionrc.cjs",
      "*.config.js",
      "*.config.mjs",
      "scripts/split-changelog.mjs",
      "scripts/custom-tag-message.mjs",
      "scripts/lowercase-commit-subject.mjs",
      "templates/**",
    ],
  },
];
