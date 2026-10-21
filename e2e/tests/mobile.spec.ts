import { type Page, expect, test } from '@playwright/test'

// The phone layout: the history is a modal sheet over the calculator.

test.use({ viewport: { width: 375, height: 667 } })

const value = (page: Page, text: string) => page.getByRole('button', { name: `${text}, copy` })

test('the history sheet is a modal dialog that takes focus and gives it back', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  for (const name of ['1', 'add', '1', 'equals']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await expect(value(page, '2')).toBeVisible()

  const toggle = page.getByRole('button', { name: 'History' })
  const dialog = page.getByRole('dialog', { name: 'History' })

  // Opening moves focus into the sheet, and Tab stays there.
  await toggle.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

  // Typing does not reach the calculator behind it; Escape closes and returns focus.
  await page.keyboard.press('7')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(value(page, '2')).toBeVisible()

  // So do the Close button and choosing an entry.
  await toggle.click()
  await dialog.getByRole('button', { name: 'Close history' }).click()
  await expect(toggle).toBeFocused()

  await toggle.click()
  await dialog.getByRole('button', { name: /use 1 \+ 1 = 2/i }).click()
  await expect(dialog).toBeHidden()
  await expect(toggle).toBeFocused()
})

test('the phone layout does not scroll', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight)
  // A scroll request must leave the page where it is.
  await page.mouse.wheel(0, 400)
  await page.evaluate(() => window.scrollTo(0, 400))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
