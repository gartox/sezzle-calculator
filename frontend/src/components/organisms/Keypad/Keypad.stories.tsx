import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import Keypad from './Keypad'

const meta = {
  title: 'Organisms/Keypad',
  component: Keypad,
  args: { onPress: fn(), onToggleHistory: fn(), historyId: 'history' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Keypad>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing to calculate yet: equals is inactive. */
export const Default: Story = {}
/** An operator waiting for its right operand stays marked. */
export const ActiveOperator: Story = { args: { activeOperator: 'multiply', equals: 'inactive' } }
export const ReadyToCalculate: Story = { args: { equals: 'ready' } }
/** A slow answer: equals shows a spinner. */
export const Busy: Story = { args: { equals: 'busy' } }
/** A key typed on the keyboard flashes its on-screen key. */
export const KeyboardHighlight: Story = { args: { pressedKey: 'digit-7' } }
export const HistoryOpen: Story = { args: { historyOpen: true } }

/** Clicking keys reports their actions in order. */
export const PressKeys: Story = {
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '1' }))
    await userEvent.click(canvas.getByRole('button', { name: 'add' }))
    await userEvent.click(canvas.getByRole('button', { name: 'square root of x' }))
    await expect(args.onPress).toHaveBeenNthCalledWith(1, { type: 'digit', digit: '1' })
    await expect(args.onPress).toHaveBeenNthCalledWith(2, { type: 'operator', operator: 'add' })
    await expect(args.onPress).toHaveBeenNthCalledWith(3, { type: 'sqrt' })
  },
}
