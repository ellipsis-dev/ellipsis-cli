import * as http from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'

// The manifest flow against a stub GitHub: the "browser" here fetches the
// CLI's /start page, submits the manifest form the way a real browser would,
// gets GitHub's redirect, and follows it to the CLI's /callback — then the
// module exchanges the code at the stub API and resolves with the app.

let github: http.Server
let githubPort: number
const received: { manifest?: object; exchangedCode?: string } = {}

beforeAll(async () => {
  github = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'POST' && url.pathname.startsWith('/organizations/')) {
      // GitHub's create-app form target: record the manifest, redirect with a code.
      let body = ''
      for await (const chunk of req) body += chunk
      const manifestJson = decodeURIComponent(body.replace(/^manifest=/, '').replace(/\+/g, '%20'))
      received.manifest = JSON.parse(manifestJson)
      const redirect = (received.manifest as { redirect_url: string }).redirect_url
      res.writeHead(302, { location: `${redirect}?code=onetime123` })
      res.end()
    } else if (req.method === 'POST' && url.pathname.startsWith('/app-manifests/')) {
      // The conversions exchange.
      received.exchangedCode = url.pathname.split('/')[2]
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 4242,
          slug: 'ellipsis-for-acme',
          name: 'Ellipsis for Acme',
          owner: { login: 'acme-platform' },
          pem: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
          webhook_secret: 'whsec_fake',
          client_id: 'Iv1.fake',
          client_secret: 'cs_fake',
          html_url: 'https://github.com/apps/ellipsis-for-acme',
        }),
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => github.listen(0, '127.0.0.1', r))
  githubPort = (github.address() as { port: number }).port
  process.env.ELLIPSIS_GITHUB_BASE_URL = `http://127.0.0.1:${githubPort}`
  process.env.ELLIPSIS_GITHUB_API_BASE_URL = `http://127.0.0.1:${githubPort}`
})

afterAll(() => {
  github.close()
})

test('manifest flow end to end against a stub GitHub', async () => {
  // Import after env vars are set (module reads them at load).
  const { createAppViaManifest } = await import('../src/lib/github_app')

  const appPromise = createAppViaManifest(
    {
      org: 'acme-platform',
      appName: 'Ellipsis for Acme',
      webhookUrl: 'https://api.ellipsis.acme.com/github/webhook',
      homepageUrl: 'https://app.ellipsis.acme.com',
    },
    {
      // The fake browser: fetch /start, submit the form to stub-GitHub, follow the redirect.
      openBrowser: (startUrl) => {
        void (async () => {
          const page = await fetch(startUrl).then((r) => r.text())
          const action = page.match(/action="([^"]+)"/)![1]
          const value = page
            .match(/name="manifest" value="([^"]*)"/)![1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
          const submit = await fetch(action, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: `manifest=${encodeURIComponent(value)}`,
            redirect: 'manual',
          })
          const location = submit.headers.get('location')!
          await fetch(location) // the browser following GitHub's redirect to /callback
        })()
      },
      timeoutMs: 5_000,
    },
  )

  const app = await appPromise
  expect(app.app_id).toBe(4242)
  expect(app.slug).toBe('ellipsis-for-acme')
  expect(app.pem).toContain('PRIVATE KEY')
  expect(app.webhook_secret).toBe('whsec_fake')
  expect(received.exchangedCode).toBe('onetime123')
  // The manifest GitHub saw carries our webhook URL and permissions.
  const m = received.manifest as {
    hook_attributes: { url: string }
    default_permissions: Record<string, string>
    public: boolean
  }
  expect(m.hook_attributes.url).toBe('https://api.ellipsis.acme.com/github/webhook')
  expect(m.default_permissions.pull_requests).toBe('write')
  expect(m.public).toBe(false)
})
