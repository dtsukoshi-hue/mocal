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
      include: ['lib/**/*.ts', 'app/api/**/*.ts', 'proxy.ts'],
      exclude: [
        'lib/database.types.ts',
        'lib/stripe.ts',
        'lib/supabase-server.ts',
        'lib/supabase-ssr.ts',
        'lib/push-client.ts',
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
