import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/design/tokens.css'
import './preview.css'

type Theme = 'both' | 'light' | 'dark'

/**
 * Renders each story once per theme. "both" (the default) puts light and dark
 * side by side, so axe checks contrast in both themes in a single run; the
 * toolbar or `?globals=theme:dark` selects one for screenshots.
 */
const withThemes: Decorator = (Story, context) => {
  const theme = (context.globals.theme ?? 'both') as Theme
  const themes: Array<'light' | 'dark'> = theme === 'both' ? ['light', 'dark'] : [theme]
  return (
    <div className="sb-themes" data-count={themes.length}>
      {themes.map((t) => (
        <div key={t} className="sb-theme" data-theme={t}>
          <Story />
        </div>
      ))}
    </div>
  )
}

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [withThemes],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'both', title: 'Light and dark' },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'both' },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i } },
    // Fail the story test on any axe violation, in both themes.
    a11y: { test: 'error' },
  },
}

export default preview
