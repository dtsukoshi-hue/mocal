import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        // server-only モジュールを Vitest 環境では no-op に置き換え
        inline: ['server-only'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx', 'proxy.ts'],
      exclude: [
        'lib/database.types.ts',
        'app/**/_components/**',  // UI コンポーネントは別途 E2E 推奨
        'app/**/page.tsx',        // ページは E2E 対象
        'app/**/layout.tsx',
        'app/manifest.ts',
        'app/error.tsx',
        'app/not-found.tsx',
        'app/global-error.tsx',
        'lib/stripe.ts',          // 単純なシングルトン
        'lib/supabase-server.ts', // 単純なファクトリ
        'lib/logger.ts',          // 単純な console ラッパー
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // 'server-only' を空モジュールに差し替え（テスト環境のみ）
      'server-only': path.resolve(__dirname, 'tests/__mocks__/server-only.ts'),
    },
  },
})
