import type { Meta, StoryObj } from '@storybook/react-vite'
import Spinner from './Spinner'

const meta = {
  title: 'Atoms/Spinner',
  component: Spinner,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Large: Story = { args: { size: 32 } }
