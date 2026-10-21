import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import HistoryPanel from './HistoryPanel'

const ENTRIES = [
  { expression: '15 % of 200 =', result: '30' },
  { expression: '5 × 4 =', result: '20' },
  { expression: '√2 =', result: '1.41421356237' },
  { expression: '10 ^ 20 =', result: '1e+20' },
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
/** On phones the panel is a sheet with a Close button. */
export const AsSheet: Story = { args: { onClose: fn() } }

/** Choosing an entry hands its raw result back. */
export const Select: Story = {
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /use 5 × 4 = 20/i }))
    await expect(args.onSelect).toHaveBeenCalledWith('20')
  },
}
