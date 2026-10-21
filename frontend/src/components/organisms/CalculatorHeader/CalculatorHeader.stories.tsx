import type { Meta, StoryObj } from '@storybook/react-vite'
import CalculatorHeader from './CalculatorHeader'

const meta = {
  title: 'Organisms/CalculatorHeader',
  component: CalculatorHeader,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalculatorHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = { args: { status: 'ready' } }
export const Offline: Story = { args: { status: 'offline' } }
export const Checking: Story = { args: { status: 'checking' } }
