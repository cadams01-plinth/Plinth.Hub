import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/** Unit tests for pure server-side logic — no Supabase/network required. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside an RSC bundle; stub it for unit tests.
      'server-only': fileURLToPath(new URL('./src/test/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
