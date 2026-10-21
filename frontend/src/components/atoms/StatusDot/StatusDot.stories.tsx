import type { Meta, StoryObj } from '@storybook/react-vite'
import StatusDot from './StatusDot'

const meta = {
  title: 'Atoms/StatusDot',
  component: StatusDot,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StatusDot>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = { args: { tone: 'ready' } }
export const Offline: Story = { args: { tone: 'offline' } }
/** Pulses while the first health check is in flight, unless motion is reduced. */
export const Checking: Story = { args: { tone: 'checking' } }
