import { composeStories } from '@storybook/react-vite'
import { render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'

// Renders every component story once in jsdom. The storybook project runs the
// same stories in a real browser with axe and their play functions; this
// smoke pass keeps presentational components inside the unit coverage report.
const modules = import.meta.glob<Record<string, unknown>>('./**/*.stories.tsx', { eager: true })

describe.each(Object.entries(modules))('%s', (_path, module) => {
  const composed = composeStories(module as Parameters<typeof composeStories>[0])
  const stories = Object.entries(composed) as Array<[string, ComponentType]>
  it.each(stories)('%s renders', (_name, Story) => {
    const { container } = render(<Story />)
    expect(container).not.toBeEmptyDOMElement()
  })
})
