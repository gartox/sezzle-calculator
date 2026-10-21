import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import HistoryPanel from './HistoryPanel'

const ENTRIES = [
  { id: 'h1', expression: '15 % of 200 =', result: '30' },
  { id: 'h2', expression: '2 + 3 × 4 =', result: '20' },
  { id: 'h3', expression: '√2 =', result: '1.41421356237' },
  { id: 'h4', expression: '10 ^ 20 =', result: '1e+20' },
]

const meta = {
  title: 'Organisms/HistoryPanel',
  component: HistoryPanel,
  args: { onSelect: fn(), entries: ENTRIES },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HistoryPanel>

export default meta
type Story = StoryObj<typeof meta>

export const WithEntries: Story = {}
export const Empty: Story = { args: { entries: [] } }
/** On phones the panel is a modal sheet: a dialog that takes focus, with a Close button. */
export const AsSheet: Story = {
  args: { modal: true, onClose: fn() },
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const dialog = within(canvasElement).getByRole('dialog', { name: 'History' })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(within(dialog).getByRole('heading', { name: 'History' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close history' }))
    await expect(args.onClose).toHaveBeenCalled()
  },
}

/** Choosing an entry hands its raw result back. */
export const Select: Story = {
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: /use 2 \+ 3 × 4 = 20/i }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith('20')
  },
}
