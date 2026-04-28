import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",          // worktree やネストした .next も無視
    "out/**",
    "build/**",
    "**/.claude/**",        // worktree など内部 artifact を除外
    "next-env.d.ts",
    "public/sw.js",         // SW は別 lint 対象（プレーン JS）
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
