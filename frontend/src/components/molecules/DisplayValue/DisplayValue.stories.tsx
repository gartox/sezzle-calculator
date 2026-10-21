import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import DisplayValue from './DisplayValue'

const meta = {
  title: 'Molecules/DisplayValue',
  component: DisplayValue,
  args: { writeClipboard: fn(async () => {}) },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: 16, background: 'var(--color-surface-display)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DisplayValue>

export default meta
type Story = StoryObj<typeof meta>

export const Zero: Story = { args: { value: '0' } }
export const Grouped: Story = { args: { value: '1234567.89' } }
/** A trailing dot or zero survives while typing. */
export const TypingDecimal: Story = { args: { value: '1234.50' } }
export const Negative: Story = { args: { value: '-42' } }
/** Fifteen digits: the font shrinks so the value still fits on one line. */
export const LongShrinks: Story = { args: { value: '123456789012345' } }
/** More digits than fit switch to exponent notation. */
export const Exponent: Story = { args: { value: '123456789012000000' } }
/** Not a number: shown as text and not copyable. */
export const ErrorText: Story = { args: { value: 'Error' } }

/** Every case in one column, from short to longest. */
export const Gallery: Story = {
  args: { value: '0' },
  render: (args) => (
    <div style={{ display: 'grid', gap: 12 }}>
      {['0', '1234567.89', '1234.50', '-42', '123456789012345', '123456789012000000', 'Error'].map(
        (v) => (
          <DisplayValue key={v} {...args} value={v} />
        ),
      )}
    </div>
  ),
}

/** Clicking the value copies the raw number and confirms it. */
export const Copy: Story = {
  args: { value: '1234.5' },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '1,234.5, copy' }))
    await expect(args.writeClipboard).toHaveBeenCalledWith('1234.5')
    await expect(await canvas.findAllByText('Copied')).toHaveLength(2)
  },
}

/** When the clipboard refuses, the user is told instead of left guessing. */
export const CopyFails: Story = {
  args: { value: '30', writeClipboard: fn(async () => Promise.reject(new Error('denied'))) },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '30, copy' }))
    await expect(await canvas.findAllByText('Copy failed')).toHaveLength(2)
  },
}
