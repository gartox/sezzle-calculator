import { act, fireEvent, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESS_FLASH_MS, useKeyboardKeypad } from './useKeyboardKeypad'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function setup(options: { paused?: boolean } = {}) {
  const press = vi.fn()
  const onPausedEscape = vi.fn()
  const hook = renderHook((props) => useKeyboardKeypad({ press, onPausedEscape, ...props }), {
    initialProps: options,
  })
  return { press, onPausedEscape, ...hook }
}

function element(tag: string, attributes: Record<string, string> = {}) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  node.textContent = tag === 'button' ? 'key' : ''
  document.body.append(node)
  return node
}

describe('useKeyboardKeypad', () => {
  it('maps keys on the document to keypad actions and flashes their key', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { press, result } = setup()
    fireEvent.keyDown(document.body, { key: '7' })
    expect(press).toHaveBeenCalledWith({ type: 'digit', digit: '7' })
    expect(result.current.pressedKey).toBe('digit-7')
    act(() => {
      vi.advanceTimersByTime(PRESS_FLASH_MS)
    })
    expect(result.current.pressedKey).toBeNull()
  })

  it('prevents the default action of the keys it uses, and only those', () => {
    setup()
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(true)
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Alt', { altKey: true }],
  ])('leaves shortcuts with %s to the browser', (_name, modifier) => {
    const { press } = setup()
    fireEvent.keyDown(document.body, { key: '1', ...modifier })
    expect(press).not.toHaveBeenCalled()
  })

  it('ignores a key another handler already took', () => {
    const { press } = setup()
    const button = element('button')
    button.addEventListener('keydown', (event) => event.preventDefault())
    fireEvent.keyDown(button, { key: '1' })
    expect(press).not.toHaveBeenCalled()
  })

  it.each([
    ['an input', () => element('input')],
    ['a textarea', () => element('textarea')],
    ['a select', () => element('select')],
    [
      'editable content',
      () => {
        const node = element('div', { contenteditable: 'true' })
        Object.defineProperty(node, 'isContentEditable', { value: true })
        return node
      },
    ],
  ])('leaves typing in %s alone', (_name, create) => {
    const { press } = setup()
    fireEvent.keyDown(create(), { key: '5' })
    expect(press).not.toHaveBeenCalled()
  })

  it('lets Enter activate a button reached with the keyboard', async () => {
    const { press } = setup()
    const first = element('button')
    const second = element('button')
    const user = userEvent.setup()
    await user.click(first)
    await user.tab()
    expect(second).toHaveFocus()
    fireEvent.keyDown(second, { key: 'Enter' })
    expect(press).not.toHaveBeenCalled()
  })

  it('makes Enter mean equals on a button focused by a click, even after typing', async () => {
    const { press } = setup()
    const button = element('button')
    const user = userEvent.setup()
    await user.click(button)
    fireEvent.keyDown(button, { key: '3' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(press).toHaveBeenLastCalledWith({ type: 'equals' })
  })

  it('while paused, sends only Escape, to close the modal', () => {
    const { press, onPausedEscape, rerender } = setup({ paused: true })
    fireEvent.keyDown(document.body, { key: '7' })
    expect(press).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(onPausedEscape).toHaveBeenCalledTimes(1)

    rerender({ paused: false })
    fireEvent.keyDown(document.body, { key: '7' })
    expect(press).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it goes away', () => {
    const { press, unmount } = setup()
    unmount()
    fireEvent.keyDown(document.body, { key: '7' })
    fireEvent.pointerDown(document.body)
    expect(press).not.toHaveBeenCalled()
  })
})
