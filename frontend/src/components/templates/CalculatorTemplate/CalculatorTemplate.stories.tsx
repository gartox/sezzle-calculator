import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import CalculatorHeader from '../../organisms/CalculatorHeader/CalculatorHeader'
import Display from '../../organisms/Display/Display'
import HistoryPanel from '../../organisms/HistoryPanel/HistoryPanel'
import Keypad from '../../organisms/Keypad/Keypad'
import CalculatorTemplate from './CalculatorTemplate'

const meta = {
  title: 'Templates/CalculatorTemplate',
  component: CalculatorTemplate,
  args: {
    header: <CalculatorHeader status="ready" />,
    display: <Display expression="15 % of 200 =" value="30" />,
    keypad: <Keypad onPress={fn()} equals="inactive" />,
    history: (
      <HistoryPanel
        entries={[
          { id: 'h1', expression: '15 % of 200 =', result: '30' },
          { id: 'h2', expression: '2 + 3 × 4 =', result: '20' },
        ]}
        onSelect={fn()}
      />
    ),
    onCloseHistory: fn(),
  },
} satisfies Meta<typeof CalculatorTemplate>

export default meta
type Story = StoryObj<typeof meta>

/** Phone width hides the history until it is opened; wide screens show it beside the calculator. */
export const Default: Story = {}
/** The history sheet open over the calculator, as on a phone: a modal dialog over an inert card. */
export const HistoryOpen: Story = {
  args: {
    historyOpen: true,
    history: (
      <HistoryPanel
        entries={[{ id: 'h1', expression: '15 % of 200 =', result: '30' }]}
        onSelect={fn()}
        modal
        onClose={fn()}
      />
    ),
  },
  globals: { theme: 'light' },
}
