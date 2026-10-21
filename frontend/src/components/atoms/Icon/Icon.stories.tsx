import type { Meta, StoryObj } from '@storybook/react-vite'
import Icon from './Icon'

const meta = {
  title: 'Atoms/Icon',
  component: Icon,
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

export const Backspace: Story = { args: { name: 'backspace' } }
export const History: Story = { args: { name: 'history' } }
export const Large: Story = { args: { name: 'backspace', size: 32 } }
