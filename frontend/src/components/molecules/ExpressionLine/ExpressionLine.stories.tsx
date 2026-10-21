import type { Meta, StoryObj } from '@storybook/react-vite'
import ExpressionLine from './ExpressionLine'

const meta = {
  title: 'Molecules/ExpressionLine',
  component: ExpressionLine,
  parameters: { layout: 'padded' },
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
export const Long: Story = {
  args: { expression: '123,456,789,012,345 × 987,654,321,098,765 =' },
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
