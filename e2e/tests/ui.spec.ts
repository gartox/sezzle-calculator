import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('adds 2 and 3 and shows 5 in the result region', async ({ page }) => {
  await page.getByLabel('Number a').fill('2')
  await page.getByLabel('Number b').fill('3')
  await page.getByRole('button', { name: 'Calculate' }).click()

  const result = page.getByRole('status')
  await expect(result).toContainText('Result')
  await expect(result).toContainText('5')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('dividing by zero shows the backend message and no result', async ({ page }) => {
  await page.getByLabel('Operation').selectOption('divide')
  await page.getByLabel('Number a').fill('1')
  await page.getByLabel('Number b').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Cannot divide by zero.')
  await expect(alert).toContainText(/Request ID: \S+/)
  await expect(page.getByRole('status')).not.toContainText('Result')
})

test('square root hides b and computes sqrt of 16', async ({ page }) => {
  await page.getByLabel('Operation').selectOption({ label: 'Square root (√a)' })

  await expect(page.getByLabel('Number b')).toHaveCount(0)

  await page.getByLabel('Number a').fill('16')
  await page.getByRole('button', { name: 'Calculate' }).click()

  await expect(page.getByRole('status')).toContainText('4')
})
