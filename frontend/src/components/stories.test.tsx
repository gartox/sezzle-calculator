import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeStories } from '@storybook/react-vite'
import { render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'

// Renders every component story once in jsdom. The storybook project runs the
// same stories in a real browser with axe and their play functions; this
// smoke pass keeps presentational components inside the unit coverage report.
//
// Story files are found by scanning the directory at run time rather than with
// import.meta.glob: Vitest caches transformed modules by content, so a glob
// expanded at transform time would silently miss story files added later.
const here = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(here, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.stories.tsx'))
  .sort()

const modules = await Promise.all(
  files.map(async (file) => [file, await import(/* @vite-ignore */ join(here, file))] as const),
)

it('finds the story files', () => {
  expect(files.length).toBeGreaterThan(0)
  expect(modules).toHaveLength(files.length)
})

describe.each(modules)('%s', (_file, module) => {
  const composed = composeStories(module as Parameters<typeof composeStories>[0])
  const stories = Object.entries(composed) as Array<[string, ComponentType]>
  it.each(stories)('%s renders', (_name, Story) => {
    const { container } = render(<Story />)
    expect(container).not.toBeEmptyDOMElement()
  })
})
