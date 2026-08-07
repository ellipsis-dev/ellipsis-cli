import * as http from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'

// The deploy-step API surface against a stub license service: the register
// contract (deployment_id + token), the bearer header on deployment-scoped
// calls, the 424 detail surfacing, and status polling — mirroring the
// stub-server style of github_app.test.ts.

let license: http.Server
const received: {
  registerBody?: object
  deployAuth?: string
  statusAuth?: string
  deployCalls: number
} = { deployCalls: 0 }

const DEPLOYMENT_ID = 'deployment_' + 'a'.repeat(24)
const TOKEN = 'ellipsis_dtoken_' + '0'.repeat(64)

beforeAll(async () => {
  license = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'POST' && url.pathname === '/v1/deployments/register') {
      let body = ''
      for await (const chunk of req) body += chunk
      received.registerBody = JSON.parse(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          deployment_id: DEPLOYMENT_ID,
          token: TOKEN,
          expires_at: '2026-08-14T00:00:00Z',
        }),
      )
    } else if (req.method === 'POST' && url.pathname === `/v1/deployments/${DEPLOYMENT_ID}/deploy`) {
      received.deployAuth = req.headers.authorization
      received.deployCalls += 1
      if (received.deployCalls === 1) {
        // First call: the role stack "hasn't finished creating".
        res.writeHead(424, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ detail: 'Could not assume the role yet.' }))
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ run_id: 'drun_' + 'b'.repeat(24), status: 'scheduled' }))
      }
    } else if (req.method === 'GET' && url.pathname === `/v1/deployments/${DEPLOYMENT_ID}`) {
      received.statusAuth = req.headers.authorization
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          deployment_id: DEPLOYMENT_ID,
          status: 'succeeded',
          error: null,
          role_arn: `arn:aws:iam::123456789012:role/ellipsis-deploy-access`,
          expires_at: '2026-08-14T00:00:00Z',
        }),
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => license.listen(0, '127.0.0.1', r))
  const port = (license.address() as { port: number }).port
  process.env.ELLIPSIS_LICENSE_BASE_URL = `http://127.0.0.1:${port}`
})

afterAll(() => {
  license.close()
})

test('register speaks the deployments contract and returns the token', async () => {
  const { registerDeployment } = await import('../src/lib/api')
  const res = await registerDeployment({
    email: 'cto@example.com',
    company: 'Acme',
    developer_count: 10,
    aws_account_id: '123456789012',
    github_org: 'acme',
    cli_version: '0.1.0',
  })
  expect(res.deployment_id).toBe(DEPLOYMENT_ID)
  expect(res.token).toBe(TOKEN)
  expect(received.registerBody).toMatchObject({ aws_account_id: '123456789012' })
})

test('deploy carries the bearer token and surfaces the 424 detail', async () => {
  const { ApiError, startDeployment } = await import('../src/lib/api')
  // First call: 424 with the customer-facing detail.
  try {
    await startDeployment(DEPLOYMENT_ID, TOKEN)
    expect.unreachable('expected a 424')
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).status).toBe(424)
    expect((err as InstanceType<typeof ApiError>).detail).toContain('Could not assume')
  }
  expect(received.deployAuth).toBe(`Bearer ${TOKEN}`)
  // Second call (the "customer retried" path): scheduled.
  const res = await startDeployment(DEPLOYMENT_ID, TOKEN)
  expect(res.status).toBe('scheduled')
})

test('status polling is bearer-authed and returns the derived status', async () => {
  const { getDeploymentStatus } = await import('../src/lib/api')
  const status = await getDeploymentStatus(DEPLOYMENT_ID, TOKEN)
  expect(status.status).toBe('succeeded')
  expect(received.statusAuth).toBe(`Bearer ${TOKEN}`)
})

test('the quick-create link binds the role to this deployment', async () => {
  const { quickCreateUrl, OPERATOR_ROLE_ARN } = await import('../src/lib/aws_role')
  // The params ride the URL fragment (#/stacks/quickcreate?...), so parse
  // them out of the fragment's query string.
  const fragmentQuery = quickCreateUrl(DEPLOYMENT_ID).split('quickcreate?')[1]
  const qs = new URLSearchParams(fragmentQuery)
  expect(qs.get('param_ExternalId')).toBe(DEPLOYMENT_ID)
  expect(qs.get('param_OperatorRoleArn')).toBe(OPERATOR_ROLE_ARN)
  expect(qs.get('stackName')).toBe('ellipsis-deploy-access')
  expect(qs.get('templateURL')).toContain('templates/deploy-role/v1.yaml')
})
