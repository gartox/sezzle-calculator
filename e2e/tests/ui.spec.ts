import { type Page, expect, test } from '@playwright/test'

// The keypad driven through accessible names only, against the real stack.

async function press(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.getByRole('button', { name, exact: true }).click()
  }
}

const display = (page: Page) => page.getByRole('group', { name: 'Display' })
const value = (page: Page, text: string) => page.getByRole('button', { name: `${text}, copy` })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Ready')
})

test('15 % of 200 by clicking the keypad', async ({ page }) => {
  await press(page, '1', '5', 'percent of', '2', '0', '0')
  await expect(display(page)).toContainText('15 % of 200')
  await press(page, 'equals')

  await expect(value(page, '30')).toBeVisible()
  await expect(display(page)).toContainText('15 % of 200 =')
})

test('a calculation with the physical keyboard only', async ({ page }) => {
  await page.keyboard.type('7*6')
  await page.keyboard.press('Enter')

  await expect(value(page, '42')).toBeVisible()
  await expect(display(page)).toContainText('7 × 6 =')
})

test('division by zero shows the backend message and a Ref', async ({ page }) => {
  await press(page, '1', 'divide', '0', 'equals')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Cannot divide by zero.')
  await expect(
    alert.getByRole('button', { name: /^Ref [0-9a-f]{8}, full ID [0-9a-f]+, copy$/ }),
  ).toBeVisible()
  await expect(display(page)).toContainText('1 ÷ 0 =')

  await press(page, '7')
  await expect(alert).toHaveCount(0)
  await expect(value(page, '7')).toBeVisible()
})

test('chaining is left to right and shows the intermediate result', async ({ page }) => {
  await press(page, '2', 'add', '3', 'multiply')
  await expect(value(page, '5')).toBeVisible()
  await expect(page.getByRole('button', { name: 'multiply' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await press(page, '4', 'equals')
  await expect(value(page, '20')).toBeVisible()
})

test('the square root sends a single operand', async ({ page }) => {
  await press(page, '1', '6', 'square root of x')
  await expect(value(page, '4')).toBeVisible()
  await expect(display(page)).toContainText('√16 =')
})

test('a history entry puts its result back', async ({ page }) => {
  await press(page, '1', '5', 'percent of', '2', '0', '0', 'equals')
  await expect(value(page, '30')).toBeVisible()
  await press(page, 'AC, all clear')
  await expect(value(page, '0')).toBeVisible()

  // At the default 1280 px width the history panel is beside the keypad.
  await page.getByRole('button', { name: /use 15 % of 200 = 30/i }).click()
  await expect(value(page, '30')).toBeVisible()
})
