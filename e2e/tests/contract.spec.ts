import { expect, test } from '@playwright/test'
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import { parse } from 'yaml'

// Validates requests and real responses against the OpenAPI document the
// server serves, using its JSON Schemas rather than hand-written checks. A
// request the schema accepts must not be rejected as malformed, a request it
// rejects must get 400, and every response body must match the schema the
// document gives for that status.

interface Spec {
  components: {
    schemas: Record<string, unknown>
    responses: Record<string, ResponseObject>
  }
  paths: Record<string, Record<string, { responses: Record<string, ResponseObject> }>>
}
interface ResponseObject {
  $ref?: string
  content?: { 'application/json'?: { schema: { $ref: string } } }
}

const CALCULATE = '/api/v1/calculate'
const SPEC_ID = 'openapi.json'
let spec: Spec
let ajv: Ajv2020

test.beforeAll(async ({ request }) => {
  const document = await request.get('/api/v1/openapi.yaml')
  spec = parse(await document.text()) as Spec
  // OpenAPI 3.1 schemas are JSON Schema 2020-12, which Ajv2020 implements.
  // They are loaded under the standard $defs container, so their internal
  // "#/components/schemas/X" references are rewritten to "#/$defs/X".
  ajv = new Ajv2020({ allErrors: true, strict: true })
  const defs = JSON.parse(
    JSON.stringify(spec.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'),
  )
  ajv.addSchema({ $id: SPEC_ID, $defs: defs })
})

/** The validator for a document reference such as "#/components/schemas/X". */
function schemaValidator(ref: string): ValidateFunction {
  const validate = ajv.getSchema(`${SPEC_ID}${ref.replace('#/components/schemas/', '#/$defs/')}`)
  if (!validate) {
    throw new Error(`no schema at ${ref}`)
  }
  return validate
}

/** The schema the document gives for one operation's response status. */
function responseValidator(path: string, method: string, status: number): ValidateFunction {
  let response = spec.paths[path][method].responses[String(status)]
  expect(response, `${method.toUpperCase()} ${path} documents ${status}`).toBeDefined()
  if (response.$ref) {
    response = spec.components.responses[response.$ref.split('/').pop() as string]
  }
  const ref = response.content?.['application/json']?.schema.$ref
  expect(ref, `${status} has a JSON schema`).toBeDefined()
  return schemaValidator(ref as string)
}

function errorsOf(validate: ValidateFunction): string {
  return ajv.errorsText(validate.errors, { separator: '; ' })
}

const CASES: Array<{
  name: string
  body: string
  schemaValid: boolean
  status: number
}> = [
  { name: 'binary add', body: '{"operation":"add","a":1,"b":2}', schemaValid: true, status: 200 },
  { name: 'unary sqrt', body: '{"operation":"sqrt","a":16}', schemaValid: true, status: 200 },
  {
    name: 'sqrt with an ignored b',
    body: '{"operation":"sqrt","a":16,"b":3}',
    schemaValid: true,
    status: 200,
  },
  {
    name: 'percent',
    body: '{"operation":"percent","a":15,"b":200}',
    schemaValid: true,
    status: 200,
  },
  {
    name: 'unknown fields are allowed',
    body: '{"operation":"add","a":1,"b":2,"note":"x"}',
    schemaValid: true,
    status: 200,
  },
  {
    name: 'division by zero is valid but impossible',
    body: '{"operation":"divide","a":1,"b":0}',
    schemaValid: true,
    status: 422,
  },
  {
    name: 'binary operation without b',
    body: '{"operation":"add","a":1}',
    schemaValid: false,
    status: 400,
  },
  { name: 'sqrt without a', body: '{"operation":"sqrt"}', schemaValid: false, status: 400 },
  {
    name: 'unknown operation',
    body: '{"operation":"modulo","a":1,"b":2}',
    schemaValid: false,
    status: 400,
  },
  {
    name: 'operand as a string',
    body: '{"operation":"add","a":"1","b":2}',
    schemaValid: false,
    status: 400,
  },
  {
    name: 'operation as a number',
    body: '{"operation":1,"a":1,"b":2}',
    schemaValid: false,
    status: 400,
  },
  { name: 'empty object', body: '{}', schemaValid: false, status: 400 },
  { name: 'array instead of object', body: '[1,2]', schemaValid: false, status: 400 },
  // The one rule JSON Schema cannot express: the literal is a valid number,
  // but too small for a 64-bit float. The document says so; the server
  // rejects it with INVALID_OPERAND.
  {
    name: 'literal that rounds to zero',
    body: '{"operation":"divide","a":1,"b":1e-999}',
    schemaValid: true,
    status: 400,
  },
]

for (const c of CASES) {
  test(`contract: ${c.name}`, async ({ request }) => {
    const validateRequest = schemaValidator('#/components/schemas/CalculateRequest')
    const valid = validateRequest(JSON.parse(c.body))
    expect(valid, errorsOf(validateRequest)).toBe(c.schemaValid)

    const response = await request.post(CALCULATE, {
      headers: { 'Content-Type': 'application/json' },
      data: c.body,
    })
    expect(response.status()).toBe(c.status)

    const body = await response.json()
    const validateResponse = responseValidator(CALCULATE, 'post', c.status)
    expect(validateResponse(body), errorsOf(validateResponse)).toBe(true)
  })
}

test('contract: the other documented responses match their schemas', async ({ request }) => {
  const checks = [
    {
      path: '/api/v1/health',
      method: 'get',
      send: () => request.get('/api/v1/health'),
      status: 200,
    },
    { path: CALCULATE, method: 'post', send: () => request.get(CALCULATE), status: 405 },
    {
      path: CALCULATE,
      method: 'post',
      send: () =>
        request.post(CALCULATE, { headers: { 'Content-Type': 'text/plain' }, data: '{}' }),
      status: 415,
    },
    {
      path: CALCULATE,
      method: 'post',
      send: () => request.post('/api/v1/missing', { data: {} }),
      status: 404,
    },
  ]
  for (const check of checks) {
    const response = await check.send()
    expect(response.status()).toBe(check.status)
    const validate = responseValidator(check.path, check.method, check.status)
    expect(validate(await response.json()), errorsOf(validate)).toBe(true)
  }
})
