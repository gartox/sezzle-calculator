import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, CALCULATE_PATH, calculate, requestBody } from './client'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the promise to reject')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('calculate', () => {
  it('posts the operation and operands as JSON and returns the result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 5 }))

    await expect(calculate('add', 2, 3)).resolves.toBe(5)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(CALCULATE_PATH)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'add', a: 2, b: 3 })
  })

  it('sends only a for sqrt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 4 }))

    await expect(calculate('sqrt', 16)).resolves.toBe(4)

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({ operation: 'sqrt', a: 16 })
    expect(body).not.toHaveProperty('b')
  })

  it('throws ApiError with the backend code and message on an error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'DIVISION_BY_ZERO',
            message: 'Cannot divide by zero.',
            requestId: 'req-123',
          },
        },
        422,
      ),
    )

    const error = await expectApiError(calculate('divide', 1, 0))
    expect(error.code).toBe('DIVISION_BY_ZERO')
    expect(error.message).toBe('Cannot divide by zero.')
    expect(error.status).toBe(422)
    expect(error.requestId).toBe('req-123')
  })

  it('throws UNEXPECTED_RESPONSE when an error body is not the envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))

    const error = await expectApiError(calculate('add', 1, 2))
    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(error.status).toBe(502)
    expect(error.message).toContain('502')
  })

  it('throws UNEXPECTED_RESPONSE when a JSON error body lacks code or message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500))

    const error = await expectApiError(calculate('add', 1, 2))
    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(error.status).toBe(500)
  })

  it('throws UNEXPECTED_RESPONSE when a 2xx body has no numeric result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'five' }))

    const error = await expectApiError(calculate('add', 2, 3))
    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(error.status).toBe(200)
  })

  it('throws NETWORK_ERROR when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = await expectApiError(calculate('add', 1, 2))
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.status).toBe(0)
    expect(error.requestId).toBeUndefined()
    expect(error.message).not.toBe('')
  })
})

describe('requestBody', () => {
  it('builds the unary shape for sqrt, dropping b', () => {
    expect(requestBody('sqrt', 16, 3)).toEqual({ operation: 'sqrt', a: 16 })
  })

  it('builds the binary shape with b', () => {
    expect(requestBody('percent', 15, 200)).toEqual({ operation: 'percent', a: 15, b: 200 })
  })

  it('refuses a binary operation without b instead of sending it', async () => {
    expect(() => requestBody('add', 1)).toThrow(TypeError)
    await expect(calculate('add', 1)).rejects.toThrow('Operation "add" needs a second operand.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
