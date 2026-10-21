import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import Display from './Display'

const meta = {
  title: 'Organisms/Display',
  component: Display,
  args: { writeClipboard: fn(async () => {}) },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Display>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { args: { expression: '', value: '0' } }
export const Typing: Story = { args: { expression: '15 % of', value: '200' } }
export const Result: Story = {
  args: {
    expression: '15 % of 200 =',
    value: '30',
    announcement: '15 percent of 200 equals 30',
    announcementId: 1,
  },
}
export const LongResult: Story = {
  args: { expression: '123,456,789 × 1,000,000 =', value: '123456789000000' },
}
export const Scientific: Story = { args: { expression: '10 ^ 20 =', value: '1e+20' } }
export const Negative: Story = { args: { expression: '2 − 5 =', value: '-3' } }
/** The expression stays; the value is replaced by the explanation and its Ref. */
export const Failure: Story = {
  args: {
    expression: '1 ÷ 0 =',
    value: '0',
    error: { message: 'Cannot divide by zero.', requestId: '3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e' },
  },
}
/** A request that failed or timed out: equals sends it again. */
export const RetryableFailure: Story = {
  args: {
    expression: '1 + 2 =',
    value: '2',
    error: { message: 'The calculator did not answer.', retryable: true },
  },
}
/** A slow answer: the region reports aria-busy. */
export const Busy: Story = { args: { expression: '2 ^ 10 =', value: '10', busy: true } }
