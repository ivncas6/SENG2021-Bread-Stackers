import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "node_modules/",
      "coverage/",
      "*.config.*",
      '.aws-sam/**',
      'events/**',
      'frontend/app.js',
    ]
  },
  { 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      indent: ["error", 2],
      quotes: ["error", "single"],
      semi: ["error", "always"],
      "no-unused-vars": "off",
      "max-len": ["error", { code: 100 }],
    }
  },
  tseslint.configs.recommended,
]);
