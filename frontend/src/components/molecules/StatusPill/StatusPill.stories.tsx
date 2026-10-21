import type { Meta, StoryObj } from '@storybook/react-vite'
import StatusPill from './StatusPill'

const meta = {
  title: 'Molecules/StatusPill',
  component: StatusPill,
} satisfies Meta<typeof StatusPill>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = { args: { status: 'ready' } }
export const Offline: Story = { args: { status: 'offline' } }
/** Before the first health check answers. */
export const Checking: Story = { args: { status: 'checking' } }

export const Gallery: Story = {
  args: { status: 'ready' },
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <StatusPill status="ready" />
      <StatusPill status="offline" />
      <StatusPill status="checking" />
    </div>
  ),
}
