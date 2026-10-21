import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ColorTokens,
  ContrastPairs,
  Foundations,
  MotionTokens,
  RadiusScale,
  SpacingScale,
  TypeScale,
} from './Foundations'

const meta = {
  title: 'Foundations',
  component: Foundations,
  // The MDX page in this folder is the docs page for these stories.
  tags: ['!autodocs'],
} satisfies Meta<typeof Foundations>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
export const Colors: Story = { render: () => <ColorTokens /> }
export const Contrast: Story = { render: () => <ContrastPairs /> }
export const Spacing: Story = { render: () => <SpacingScale /> }
export const Typography: Story = { render: () => <TypeScale /> }
export const Radius: Story = { render: () => <RadiusScale /> }
export const Motion: Story = { render: () => <MotionTokens /> }
