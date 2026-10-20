import { defineConfig, devices } from '@playwright/test'

const PORT = 8090
const baseURL = `http://127.0.0.1:${PORT}`
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Builds the frontend (when needed) and the Go binary, then serves both.
    command: 'sh scripts/start-stack.sh',
    url: `${baseURL}/api/v1/health`,
    // RATE_LIMIT_RPS=0 turns the per-IP limit off so parallel workers never
    // trip it. The 429 path is covered by the Go unit tests, not end to end.
    env: { PORT: String(PORT), STATIC_DIR: 'frontend/dist', RATE_LIMIT_RPS: '0' },
    // When something already answers on the port (for example the Docker
    // container started with PORT=8090), test against it instead.
    reuseExistingServer: true,
    // A cold start installs frontend dependencies and compiles Go.
    timeout: 5 * 60 * 1000,
  },
})
