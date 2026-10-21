import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import Icon from '../Icon/Icon'
import Key from './Key'

const meta = {
  title: 'Atoms/Key',
  component: Key,
  parameters: { layout: 'padded' },
  args: { onPress: fn() },
} satisfies Meta<typeof Key>

export default meta
type Story = StoryObj<typeof meta>

export const Digit: Story = { args: { label: '7', name: '7', variant: 'digit' } }

export const Operator: Story = {
  args: { label: '×', name: 'multiply', variant: 'operator', active: false },
}

/** The operator waiting for its second operand: aria-pressed plus an outline. */
export const ActiveOperator: Story = {
  args: { label: '×', name: 'multiply', variant: 'operator', active: true },
}

export const Function: Story = {
  args: { label: '√x', name: 'square root of x', variant: 'function' },
}

export const Utility: Story = { args: { label: 'AC', name: 'AC, all clear', variant: 'utility' } }

export const Backspace: Story = {
  args: { label: <Icon name="backspace" />, name: 'backspace', variant: 'utility' },
}

export const Equals: Story = { args: { label: '=', name: 'equals', variant: 'equals' } }

/** Nothing to calculate yet: quieter, still legible, ignores presses. */
export const EqualsInactive: Story = {
  args: { label: '=', name: 'equals', variant: 'equals', inactive: true },
}

/** The look a key gets for a moment when it is typed on the keyboard. */
export const Pressed: Story = { args: { label: '8', name: '8', pressed: true } }

export const Disabled: Story = { args: { label: '9', name: '9', disabled: true } }

/** A result is on its way: spinner, aria-busy, presses ignored. */
export const Busy: Story = { args: { label: '=', name: 'equals', variant: 'equals', busy: true } }

export const Wide: Story = {
  args: { label: '0', name: '0', wide: true },
  render: (args) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 64px)', gap: 8 }}>
      <Key {...args} />
    </div>
  ),
}

/** Every variant and state side by side. */
export const AllVariants: Story = {
  args: { label: '7', name: '7' },
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(56px, 72px))',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <Key label="7" name="7" variant="digit" />
      <Key label="√x" name="square root of x" variant="function" />
      <Key label="AC" name="AC, all clear" variant="utility" />
      <Key label="×" name="multiply" variant="operator" active={false} />
      <Key label="8" name="8" pressed />
      <Key label={<Icon name="backspace" />} name="backspace" variant="utility" />
      <Key label="9" name="9" disabled />
      <Key label="÷" name="divide" variant="operator" active />
      <Key label="0" name="0" wide />
      <Key label="=" name="equals" variant="equals" inactive />
      <Key label="=" name="equals" variant="equals" />
      <Key label="=" name="equals" variant="equals" busy />
    </div>
  ),
}

/** Clicking or pressing Enter calls onPress once each. */
export const PressInteraction: Story = {
  args: { label: '5', name: '5' },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const key = within(canvasElement).getByRole('button', { name: '5' })
    await userEvent.click(key)
    key.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onPress).toHaveBeenCalledTimes(2)
  },
}

/** A busy key keeps its name for screen readers and ignores presses. */
export const BusyIgnoresPresses: Story = {
  args: { label: '=', name: 'equals', variant: 'equals', busy: true },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const key = within(canvasElement).getByRole('button', { name: 'equals' })
    await expect(key).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(key)
    await expect(args.onPress).not.toHaveBeenCalled()
  },
}
