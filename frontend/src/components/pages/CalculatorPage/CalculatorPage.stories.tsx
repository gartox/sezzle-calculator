import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { fakeCalculate } from '../../../test/fakeApi'
import { memoryStorage } from '../../../test/memoryStorage'
import CalculatorPage from './CalculatorPage'

const meta = {
  title: 'Pages/CalculatorPage',
  component: CalculatorPage,
  args: {
    calculate: fn(fakeCalculate()),
    checkHealth: fn(async () => true),
    storage: null,
    writeClipboard: fn(async () => {}),
  },
} satisfies Meta<typeof CalculatorPage>

export default meta
type Story = StoryObj<typeof meta>

async function pressKeys(canvas: ReturnType<typeof within>, names: string[]) {
  for (const name of names) {
    await userEvent.click(canvas.getByRole('button', { name }))
  }
}

export const Default: Story = {}
export const Offline: Story = { args: { checkHealth: fn(async () => false) } }
export const WithHistory: Story = {
  args: {
    storage: memoryStorage([
      { expression: '15 % of 200 =', result: '30' },
      { expression: '2 + 3 × 4 =', result: '20' },
    ]),
  },
}

/** Typing 15 % of 200 with the keypad shows 30 and records it. */
export const TypingACalculation: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['1', '5', 'percent of', '2', '0', '0'])
    await expect(canvas.getByRole('group', { name: 'Display' })).toHaveTextContent('15 % of 200')
    await pressKeys(canvas, ['equals'])
    await expect(await canvas.findByRole('button', { name: '30, copy' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /use 15 % of 200 = 30/i })).toBeInTheDocument()
  },
}

/** Left to right: 2 + 3 × shows 5, then × 4 = gives 20. */
export const Chaining: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['2', 'add', '3', 'multiply'])
    await expect(await canvas.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'multiply' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await pressKeys(canvas, ['4', 'equals'])
    await expect(await canvas.findByRole('button', { name: '20, copy' })).toBeInTheDocument()
    await expect(
      await canvas.findByRole('button', { name: /use 2 \+ 3 × 4 = 20/i }),
    ).toBeInTheDocument()
  },
}

/** Percent inside a chain is a percent of the running total: 200 + 10 % = 220. */
export const PercentInAChain: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['2', '0', '0', 'add', '1', '0', 'percent of'])
    const display = canvas.getByRole('group', { name: 'Display' })
    await waitFor(() => expect(display).toHaveTextContent('200 + 20'))
    await pressKeys(canvas, ['equals'])
    await expect(await canvas.findByRole('button', { name: '220, copy' })).toBeInTheDocument()
  },
}

/** On a slow network, keys pressed while an answer is on its way are kept and applied in order. */
export const SlowNetwork: Story = {
  args: { calculate: fn(fakeCalculate(400)) },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['2', 'add', '3', 'multiply', '4', 'equals'])
    await expect(
      await canvas.findByRole('button', { name: '20, copy' }, { timeout: 3000 }),
    ).toBeInTheDocument()
  },
}

/** Keys clicked with the mouse, then Enter on the keyboard: Enter calculates. */
export const MouseThenEnter: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['2', 'add', '3'])
    await userEvent.keyboard('{Enter}')
    await expect(await canvas.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'Display' })).toHaveTextContent('2 + 3 =')
  },
}

/** Division by zero shows the message and its Ref, and keeps the expression. */
export const DivisionByZero: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pressKeys(canvas, ['1', 'divide', '0', 'equals'])
    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent('Cannot divide by zero.')
    await expect(alert).toHaveTextContent('Ref 3f9c2a7d')
    await expect(canvas.getByRole('group', { name: 'Display' })).toHaveTextContent('1 ÷ 0 =')
  },
}

/** Only the physical keyboard: 7 * 6 Enter. */
export const KeyboardOnly: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.keyboard('7*6{Enter}')
    await expect(await canvas.findByRole('button', { name: '42, copy' })).toBeInTheDocument()
  },
}
