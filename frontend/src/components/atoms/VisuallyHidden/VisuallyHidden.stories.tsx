import type { Meta, StoryObj } from '@storybook/react-vite'
import VisuallyHidden from './VisuallyHidden'

const meta = {
  title: 'Atoms/VisuallyHidden',
  component: VisuallyHidden,
  parameters: { layout: 'padded' },
  args: { children: 'Read by screen readers only' },
} satisfies Meta<typeof VisuallyHidden>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing is visible; the text is in the accessibility tree. */
export const Default: Story = {}

/** As a polite live region, the way the calculator announces results. */
export const LiveRegion: Story = { args: { 'aria-live': 'polite', children: 'Result 30' } }
