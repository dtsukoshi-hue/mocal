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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 自動生成系・lint 対象外
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    // アンダースコア prefix の引数 / 変数は「意図的に未使用」とみなす（標準慣習）
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern:               "^_",
          varsIgnorePattern:               "^_",
          caughtErrorsIgnorePattern:       "^_",
          destructuredArrayIgnorePattern:  "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
