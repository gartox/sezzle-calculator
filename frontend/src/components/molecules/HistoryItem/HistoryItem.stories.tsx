import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import HistoryItem from './HistoryItem'

const meta = {
  title: 'Molecules/HistoryItem',
  component: HistoryItem,
  args: { onSelect: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: 8, background: 'var(--color-surface-card)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HistoryItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { expression: '15 % of 200 =', result: '30' } }
export const LargeResult: Story = { args: { expression: '123,456 × 1,000 =', result: '123456000' } }
export const LongExpression: Story = {
  args: { expression: '123,456,789,012,345 × 987,654,321,098,765 =', result: '1.21932631137e+29' },
}

export const Gallery: Story = {
  args: { expression: '', result: '' },
  render: (args) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <HistoryItem {...args} expression="15 % of 200 =" result="30" />
      <HistoryItem {...args} expression="2 + 3 × 4 =" result="20" />
      <HistoryItem {...args} expression="√2 =" result="1.41421356237" />
      <HistoryItem {...args} expression="123,456 × 1,000 =" result="123456000" />
    </div>
  ),
}

/** Choosing an entry hands its raw result back. */
export const Select: Story = {
  args: { expression: '15 % of 200 =', result: '30' },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: /use 15 % of 200 = 30/i }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith('30')
  },
}
