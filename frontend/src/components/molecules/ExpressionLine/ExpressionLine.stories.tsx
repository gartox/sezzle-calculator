import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import ExpressionLine from './ExpressionLine'

const meta = {
  title: 'Molecules/ExpressionLine',
  component: ExpressionLine,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: 16, background: 'var(--color-surface-display)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExpressionLine>

export default meta
type Story = StoryObj<typeof meta>

/** Empty: keeps its height so the value does not move. */
export const Empty: Story = { args: { expression: '' } }
export const PendingOperator: Story = { args: { expression: '2 + 3 ×' } }
/** Percent reads as "a percent of b", the API's meaning. */
export const Percent: Story = { args: { expression: '15 % of 200 =' } }
export const SquareRoot: Story = { args: { expression: '√16 =' } }
/** Too long to fit: clipped at the start, so the end that was just typed stays visible. */
export const Long: Story = {
  args: { expression: '123,456,789,012,345 × 987,654,321,098,765 =' },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const text = within(canvasElement).getByText(/987,654,321,098,765 =$/)
    const line = text.parentElement as HTMLElement
    const shown = line.getBoundingClientRect()
    const content = text.getBoundingClientRect()
    await expect(content.width).toBeGreaterThan(shown.width)
    await expect(content.right).toBeLessThanOrEqual(shown.right + 1)
    await expect(content.left).toBeLessThan(shown.left)
  },
}

export const Gallery: Story = {
  args: { expression: '' },
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {['', '2 + 3 ×', '15 % of 200 =', '√16 =', '123,456,789,012,345 × 987,654,321,098,765 ='].map(
        (e) => (
          <ExpressionLine key={e || 'empty'} expression={e} />
        ),
      )}
    </div>
  ),
}
