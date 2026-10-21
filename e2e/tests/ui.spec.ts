import { type Page, expect, test } from '@playwright/test'

// The keypad driven through accessible names only, against the real stack.

const CALCULATE = '**/api/v1/calculate'

async function press(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.getByRole('button', { name, exact: true }).click()
  }
}

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
}

const display = (page: Page) => page.getByRole('group', { name: 'Display' })
const value = (page: Page, text: string) => page.getByRole('button', { name: `${text}, copy` })

test.describe('calculations', () => {
  test.beforeEach(async ({ page }) => open(page))

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

  test('percent inside a chain is a percent of the running total', async ({ page }) => {
    await press(page, '2', '0', '0', 'add', '1', '0', 'percent of')
    await expect(display(page)).toContainText('200 + 20')
    await press(page, 'equals')
    await expect(value(page, '220')).toBeVisible()
  })

  test('the square root sends a single operand', async ({ page }) => {
    await press(page, '1', '6', 'square root of x')
    await expect(value(page, '4')).toBeVisible()
    await expect(display(page)).toContainText('√16 =')
  })

  test('the history records the whole chain and puts its result back', async ({ page }) => {
    await press(page, '2', 'add', '3', 'multiply', '4', 'equals')
    await expect(value(page, '20')).toBeVisible()
    await press(page, 'AC, all clear')
    await expect(value(page, '0')).toBeVisible()

    // At the default 1280 px width the history panel is beside the keypad.
    await page.getByRole('button', { name: /use 2 \+ 3 × 4 = 20/i }).click()
    await expect(value(page, '20')).toBeVisible()
  })
})

test.describe('input', () => {
  test('the keyboard works right after the page loads, without a click', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.type('2+3')
    await page.keyboard.press('Enter')
    await expect(value(page, '5')).toBeVisible()
  })

  test('Enter calculates after a key was clicked with the mouse', async ({ page }) => {
    await open(page)
    await press(page, '2')
    await page.keyboard.type('+3*4')
    await page.keyboard.press('Enter')
    await expect(value(page, '20')).toBeVisible()
  })

  test('Enter calculates when every key was clicked', async ({ page }) => {
    await open(page)
    await press(page, '2', 'add', '3')
    await page.keyboard.press('Enter')
    await expect(value(page, '5')).toBeVisible()
    await expect(display(page)).toContainText('2 + 3 =')
  })

  test('keys pressed while an answer is slow are applied in order', async ({ page }) => {
    const sent: unknown[] = []
    await page.route(CALCULATE, async (route) => {
      sent.push(route.request().postDataJSON())
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.continue()
    })
    await open(page)
    await press(page, '2', 'add', '3', 'multiply', '4', 'equals')

    await expect(value(page, '20')).toBeVisible()
    expect(sent).toEqual([
      { operation: 'add', a: 2, b: 3 },
      { operation: 'multiply', a: 5, b: 4 },
    ])
  })

  test('AC cancels a request that never answers', async ({ page }) => {
    await page.route(CALCULATE, () => {}) // never answers
    await open(page)
    await press(page, '1', 'add', '2', 'equals')
    await press(page, 'AC, all clear', '9')
    await expect(value(page, '9')).toBeVisible()
  })

  test('a request that never answers times out, and equals retries it', async ({ page }) => {
    await page.route(CALCULATE, () => {}) // never answers
    await open(page)
    await press(page, '1', 'add', '2', 'equals')
    await expect(page.getByRole('alert')).toContainText('did not answer', { timeout: 15_000 })

    await page.unroute(CALCULATE)
    await press(page, 'equals')
    await expect(value(page, '3')).toBeVisible()
  })
})
