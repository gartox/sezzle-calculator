import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the Go API runs separately; forward API calls to it so
    // the browser stays same-origin and no CORS configuration is needed.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: [['text', { skipFull: false }], 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Stories and the Foundations page are documentation, exercised by the
      // storybook project; coverage measures the code the app ships.
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.d.ts',
        'src/**/*.stories.tsx',
        'src/design/**',
      ],
    },
    projects: [
      {
        // Fast unit and component tests in jsdom: `npm test`, `make test`.
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // Every story rendered in a real Chromium, with axe failing on any
        // violation: `npm run test-storybook`, `make storybook-test`.
        extends: true,
        plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
