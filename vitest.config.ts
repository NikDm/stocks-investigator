import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    config: false,
    main: './src/index.ts',
    miniflare: {
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
      bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
    },
  }))],
  test: { setupFiles: ['./test/setup.ts'] },
});
