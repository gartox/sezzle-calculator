import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import ErrorNotice from './ErrorNotice'

const meta = {
  title: 'Molecules/ErrorNotice',
  component: ErrorNotice,
  args: { writeClipboard: fn(async () => {}) },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: 16, background: 'var(--color-surface-display)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ErrorNotice>

export default meta
type Story = StoryObj<typeof meta>

export const WithRef: Story = {
  args: { message: 'Cannot divide by zero.', requestId: '3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e' },
}
/** Client-side failures, such as the network being down, have no request ID. */
export const WithoutRef: Story = { args: { message: 'Could not reach the calculator service.' } }
export const LongMessage: Story = {
  args: {
    message: 'Too many requests. Try again in 3 seconds.',
    requestId: 'support-trace-0042',
  },
}

export const Gallery: Story = {
  args: { message: '' },
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <ErrorNotice message="Cannot divide by zero." requestId="3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e" />
      <ErrorNotice message="The result is not a finite number." requestId="7d3a7d618389440f" />
      <ErrorNotice message="Could not reach the calculator service." />
    </div>
  ),
}

/** Activating the Ref copies the whole request ID and confirms it. */
export const CopyRef: Story = {
  args: { message: 'Cannot divide by zero.', requestId: '3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e' },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: /^Ref 3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e/ }),
    )
    await expect(args.writeClipboard).toHaveBeenCalledWith('3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e')
    await expect(await canvas.findAllByText('Copied')).toHaveLength(2)
  },
}
