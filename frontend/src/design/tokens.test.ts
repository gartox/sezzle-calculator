import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The dark palette is written twice: once for data-theme="dark" and once for
// the system preference. These tests fail if the two drift apart, or if a
// color token exists in one theme only. The file is read from disk because
// Vitest does not load CSS contents.

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')

/** The custom properties declared in the first block after `selector`. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(selector)
  expect(start, `${selector} is in tokens.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '')
  const entries = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
    ([, name, value]) => [name, value.trim()] as const,
  )
  return new Map(entries)
}

const light = declarations(":root,\n[data-theme='light']")
const dark = declarations("\n[data-theme='dark']")
const systemDark = declarations(":root:not([data-theme='light'])")

describe('tokens.css', () => {
  it('writes the same dark palette for data-theme and the system preference', () => {
    expect(dark.size).toBeGreaterThan(10)
    expect(Object.fromEntries(systemDark)).toEqual(Object.fromEntries(dark))
  })

  it('gives every themed token a value in both themes', () => {
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort())
  })
})
