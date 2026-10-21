import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Writes docs/screenshot.png for the README. Opt-in, so ordinary runs never
// rewrite a committed file: SCREENSHOT=1 npx playwright test tests/screenshot.spec.ts
test.skip(!process.env.SCREENSHOT, 'set SCREENSHOT=1 to capture the README screenshot')

test.use({ viewport: { width: 1024, height: 768 }, colorScheme: 'light', reducedMotion: 'reduce' })

test('README screenshot after 15 % of 200 =', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  for (const name of ['1', '5', 'percent of', '2', '0', '0', 'equals']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await expect(page.getByRole('button', { name: '30, copy' })).toBeVisible()
  await page.mouse.move(0, 0)
  await page.screenshot({ path: resolve(__dirname, '../../docs/screenshot.png'), fullPage: true })
})
