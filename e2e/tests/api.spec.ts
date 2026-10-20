import { expect, test } from '@playwright/test'

const calculatePath = '/api/v1/calculate'

test('GET /api/v1/health returns ok', async ({ request }) => {
  const response = await request.get('/api/v1/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/json')
  expect(await response.json()).toEqual({ status: 'ok' })
})

test('POST add 0.1 and 0.2 returns 0.3', async ({ request }) => {
  const response = await request.post(calculatePath, {
    data: { operation: 'add', a: 0.1, b: 0.2 },
  })

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ result: 0.3 })
})

test('POST divide by zero returns 422 DIVISION_BY_ZERO', async ({ request }) => {
  const response = await request.post(calculatePath, {
    data: { operation: 'divide', a: 1, b: 0 },
  })

  expect(response.status()).toBe(422)
  const body = await response.json()
  expect(body.error.code).toBe('DIVISION_BY_ZERO')
  expect(body.error.message).toBe('Cannot divide by zero.')
})

test('POST an unknown operation returns 400 INVALID_OPERATION', async ({ request }) => {
  const response = await request.post(calculatePath, {
    data: { operation: 'modulo', a: 1, b: 2 },
  })

  expect(response.status()).toBe(400)
  const body = await response.json()
  expect(body.error.code).toBe('INVALID_OPERATION')
})

test('GET on the calculate endpoint returns 405 with an Allow header', async ({ request }) => {
  const response = await request.get(calculatePath)

  expect(response.status()).toBe(405)
  expect(response.headers()['allow']).toBe('POST')
  const body = await response.json()
  expect(body.error.code).toBe('METHOD_NOT_ALLOWED')
})

test('POST a malformed body returns 400 INVALID_JSON', async ({ request }) => {
  const response = await request.post(calculatePath, {
    headers: { 'Content-Type': 'application/json' },
    data: '{"operation":"add",',
  })

  expect(response.status()).toBe(400)
  const body = await response.json()
  expect(body.error.code).toBe('INVALID_JSON')
})
