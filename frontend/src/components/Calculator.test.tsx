import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, OPERATIONS, calculate, type ErrorCode } from '../api/client'
import Calculator from './Calculator'
import { validateNumber } from './validateNumber'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, calculate: vi.fn() }
})

const calculateMock = vi.mocked(calculate)

function setup() {
  const user = userEvent.setup()
  render(<Calculator />)
  return {
    user,
    inputA: () => screen.getByLabelText('Number a'),
    inputB: () => screen.getByLabelText('Number b'),
    select: () => screen.getByLabelText('Operation'),
    button: () => screen.getByRole('button', { name: /calculate/i }),
  }
}

afterEach(() => {
  calculateMock.mockReset()
})

describe('validateNumber', () => {
  it('rejects empty and non-numeric input and accepts numbers', () => {
    expect(validateNumber('')).toBe('Enter a number.')
    expect(validateNumber('   ')).toBe('Enter a number.')
    expect(validateNumber('abc')).toBe('Enter a valid number.')
    expect(validateNumber('Infinity')).toBe('Enter a valid number.')
    expect(validateNumber('42')).toBeUndefined()
    expect(validateNumber('-0.5')).toBeUndefined()
    expect(validateNumber('1e3')).toBeUndefined()
  })
})

describe('Calculator', () => {
  it('renders both inputs, the submit button and all seven operations', () => {
    const { inputA, inputB, select, button } = setup()

    expect(inputA()).toBeInTheDocument()
    expect(inputB()).toBeInTheDocument()
    expect(button()).toBeEnabled()

    const options = within(select()).getAllByRole('option')
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(
      OPERATIONS.map((o) => o.value),
    )
    expect(options).toHaveLength(7)
  })

  it('calls the API and shows the result', async () => {
    calculateMock.mockResolvedValueOnce(5)
    const { user, inputA, inputB, button } = setup()

    await user.type(inputA(), '2')
    await user.type(inputB(), '3')
    await user.click(button())

    expect(calculateMock).toHaveBeenCalledWith('add', 2, 3)
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(screen.getByText('5').closest('[aria-live="polite"]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('submits with Enter', async () => {
    calculateMock.mockResolvedValueOnce(-1)
    const { user, inputA, inputB, select } = setup()

    await user.selectOptions(select(), 'subtract')
    await user.type(inputA(), '2')
    await user.type(inputB(), '3{Enter}')

    expect(calculateMock).toHaveBeenCalledWith('subtract', 2, 3)
    expect(await screen.findByText('-1')).toBeInTheDocument()
  })

  it('shows the backend message in an alert when the API fails', async () => {
    calculateMock.mockRejectedValueOnce(
      new ApiError('DIVISION_BY_ZERO', 'Cannot divide by zero.', 422, 'req-42'),
    )
    const { user, inputA, inputB, select, button } = setup()

    await user.selectOptions(select(), 'divide')
    await user.type(inputA(), '1')
    await user.type(inputB(), '0')
    await user.click(button())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cannot divide by zero.')
    expect(within(alert).getByText('Request ID: req-42')).toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
  })

  it('shows a generic message when the failure is not an ApiError', async () => {
    calculateMock.mockRejectedValueOnce(new Error('boom'))
    const { user, inputA, inputB, button } = setup()

    await user.type(inputA(), '1')
    await user.type(inputB(), '2')
    await user.click(button())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
    expect(alert).not.toHaveTextContent(/request id/i)
  })

  it('shows inline messages for empty input and does not call the API', async () => {
    const { user, button, inputA, inputB } = setup()

    await user.click(button())

    expect(screen.getAllByText('Enter a number.')).toHaveLength(2)
    expect(inputA()).toHaveAttribute('aria-invalid', 'true')
    expect(inputB()).toHaveAttribute('aria-invalid', 'true')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('shows an inline message for non-numeric input and does not call the API', async () => {
    const { user, button, inputA, inputB } = setup()

    await user.type(inputA(), 'abc')
    await user.type(inputB(), '3')
    await user.click(button())

    expect(screen.getByText(/enter a (valid )?number\./i)).toBeInTheDocument()
    expect(inputA()).toHaveAttribute('aria-invalid', 'true')
    expect(inputB()).not.toHaveAttribute('aria-invalid')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('hides b for sqrt and calls the API without it', async () => {
    calculateMock.mockResolvedValueOnce(4)
    const { user, inputA, select, button } = setup()

    await user.selectOptions(select(), 'sqrt')

    expect(screen.queryByLabelText('Number b')).not.toBeInTheDocument()

    await user.type(inputA(), '16')
    await user.click(button())

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(calculateMock.mock.calls[0]).toEqual(['sqrt', 16, undefined])
    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  it('drops a stale b error when switching to sqrt', async () => {
    const { user, select, button, inputA } = setup()

    await user.type(inputA(), '9')
    await user.click(button())
    expect(screen.getByText('Enter a number.')).toBeInTheDocument()

    await user.selectOptions(select(), 'sqrt')

    expect(screen.queryByText('Enter a number.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Number b')).not.toBeInTheDocument()
  })

  it('disables the button while the request is pending', async () => {
    let resolveRequest: (value: number) => void = () => {}
    calculateMock.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolveRequest = resolve
      }),
    )
    const { user, inputA, inputB, button } = setup()

    await user.type(inputA(), '2')
    await user.type(inputB(), '3')
    await user.click(button())

    const pending = screen.getByRole('button', { name: /calculating/i })
    expect(pending).toBeDisabled()

    resolveRequest(5)

    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate' })).toBeEnabled()
  })

  it('clears the previous result and error on a new submit', async () => {
    calculateMock
      .mockResolvedValueOnce(5)
      .mockRejectedValueOnce(
        new ApiError('RESULT_OVERFLOW', 'The result is not a finite number.', 422),
      )
      .mockResolvedValueOnce(7)
    const { user, inputA, inputB, button } = setup()

    await user.type(inputA(), '2')
    await user.type(inputB(), '3')
    await user.click(button())
    expect(await screen.findByText('5')).toBeInTheDocument()

    await user.click(button())
    expect(await screen.findByRole('alert')).toHaveTextContent('not a finite number')
    expect(screen.queryByText('5')).not.toBeInTheDocument()

    await user.click(button())
    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// Keyed by every ErrorCode, so a code added to the OpenAPI document without a
// case here fails the typecheck. Each entry is the status and message the
// backend (or the client, for the last two) produces.
const ERROR_CASES: Record<ErrorCode, [status: number, message: string]> = {
  INVALID_JSON: [
    400,
    'Request body must be a JSON object with a string "operation" and numeric "a" and "b".',
  ],
  INVALID_OPERATION: [400, 'Unknown operation "modulo".'],
  INVALID_OPERAND: [400, 'Operand "b" is required for "add".'],
  DIVISION_BY_ZERO: [422, 'Cannot divide by zero.'],
  NEGATIVE_SQRT: [422, 'Cannot take the square root of a negative number.'],
  RESULT_OVERFLOW: [422, 'The result is not a finite number.'],
  METHOD_NOT_ALLOWED: [405, 'Use POST to calculate.'],
  NOT_FOUND: [404, 'No such API route.'],
  RATE_LIMITED: [429, 'Too many requests. Try again in 1 second.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Content-Type must be application/json.'],
  NETWORK_ERROR: [0, 'Could not reach the calculator service.'],
  UNEXPECTED_RESPONSE: [502, 'The calculator service returned an unexpected response (HTTP 502).'],
}

describe('Calculator error display', () => {
  it.each(Object.entries(ERROR_CASES))(
    'shows the message for %s, with the request ID when the server sent one',
    async (code, [status, message]) => {
      const fromServer = status !== 0 && code !== 'UNEXPECTED_RESPONSE'
      calculateMock.mockRejectedValueOnce(
        new ApiError(code as ErrorCode, message, status, fromServer ? 'req-9' : undefined),
      )
      const { user, inputA, inputB, button } = setup()

      await user.type(inputA(), '1')
      await user.type(inputB(), '2')
      await user.click(button())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(message)
      if (fromServer) {
        expect(within(alert).getByText('Request ID: req-9')).toBeInTheDocument()
      } else {
        expect(alert).not.toHaveTextContent(/request id/i)
      }
      expect(screen.queryByText('Result')).not.toBeInTheDocument()
    },
  )
})
