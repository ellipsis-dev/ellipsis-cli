import * as http from 'node:http'
import { listDeploymentDir, readDeploymentFile, writeDeploymentFile } from './paths'

// GitHub App creation via the app-manifest flow. There is no REST endpoint for
// creating org-owned apps; the flow is: serve a self-submitting form that POSTs
// a manifest JSON to github.com, the org owner clicks "Create GitHub App",
// GitHub redirects back to our localhost listener with a one-time code, and we
// exchange it (POST /app-manifests/{code}/conversions, unauthenticated) for the
// app's full credentials: App ID, private key PEM, webhook secret, client
// id/secret. The customer never copy-pastes a credential.

export interface GithubAppManifestParams {
  org: string
  appName: string
  webhookUrl: string
  homepageUrl: string
}

export interface CreatedGithubApp {
  app_id: number
  slug: string
  name: string
  owner_login: string
  pem: string
  webhook_secret: string
  client_id: string
  client_secret: string
  html_url: string
  created_at: string
}

export function buildManifest(params: GithubAppManifestParams, redirectUrl: string): object {
  return {
    name: params.appName,
    url: params.homepageUrl,
    hook_attributes: { url: params.webhookUrl },
    redirect_url: redirectUrl,
    public: false,
    default_permissions: {
      contents: 'write',
      issues: 'write',
      pull_requests: 'write',
      metadata: 'read',
      members: 'read',
      checks: 'read',
    },
    default_events: [
      'push',
      'pull_request',
      'pull_request_review',
      'pull_request_review_comment',
      'issues',
      'issue_comment',
    ],
  }
}

/** The self-submitting page: a form POSTing the manifest to GitHub's create-app URL. */
export function renderManifestPage(createUrl: string, manifest: object): string {
  const json = JSON.stringify(manifest).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!doctype html>
<html><body>
<p>Redirecting you to GitHub to create the app&hellip;</p>
<form id="f" action="${createUrl}" method="post">
  <input type="hidden" name="manifest" value="${json}">
</form>
<script>document.getElementById('f').submit()</script>
</body></html>`
}

const GITHUB_BASE = process.env.ELLIPSIS_GITHUB_BASE_URL ?? 'https://github.com'
const GITHUB_API_BASE = process.env.ELLIPSIS_GITHUB_API_BASE_URL ?? 'https://api.github.com'

/**
 * Run the manifest flow: listen on localhost, open the browser, wait for
 * GitHub's redirect, exchange the code. Resolves with the created app.
 */
export async function createAppViaManifest(
  params: GithubAppManifestParams,
  opts: { openBrowser: (url: string) => void; timeoutMs?: number },
): Promise<CreatedGithubApp> {
  const createUrl = `${GITHUB_BASE}/organizations/${params.org}/settings/apps/new`

  return new Promise<CreatedGithubApp>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/start') {
        const port = (server.address() as { port: number }).port
        const manifest = buildManifest(params, `http://localhost:${port}/callback`)
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(renderManifestPage(createUrl, manifest))
      } else if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        if (!code) {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('Missing code parameter.')
          return
        }
        try {
          const app = await exchangeManifestCode(code)
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('<html><body><p>GitHub App created. You can close this tab and return to your terminal.</p></body></html>')
          server.close()
          clearTimeout(timer)
          resolve(app)
        } catch (err) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end(`Exchange failed: ${(err as Error).message}`)
          server.close()
          clearTimeout(timer)
          reject(err as Error)
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    const timer = setTimeout(
      () => {
        server.close()
        reject(new Error('Timed out waiting for the GitHub redirect.'))
      },
      opts.timeoutMs ?? 10 * 60 * 1000,
    )

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      opts.openBrowser(`http://localhost:${port}/start`)
    })
    server.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function exchangeManifestCode(code: string): Promise<CreatedGithubApp> {
  const res = await fetch(`${GITHUB_API_BASE}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`GitHub answered ${res.status} exchanging the manifest code.`)
  }
  const body = (await res.json()) as {
    id: number
    slug: string
    name: string
    owner: { login: string }
    pem: string
    webhook_secret: string
    client_id: string
    client_secret: string
    html_url: string
  }
  return {
    app_id: body.id,
    slug: body.slug,
    name: body.name,
    owner_login: body.owner.login,
    pem: body.pem,
    webhook_secret: body.webhook_secret,
    client_id: body.client_id,
    client_secret: body.client_secret,
    html_url: body.html_url,
    created_at: new Date().toISOString(),
  }
}

// Created-app credentials live under the deployment until the deploy step
// writes them into the customer's Secrets Manager:
//   deployments/{id}/github/apps/{app_id}/secret.pem   the private key, alone
//   deployments/{id}/github/apps/{app_id}/app.json     everything else
// The key gets its own file so it can be shredded independently after the
// deploy step moves it, leaving the harmless metadata behind.

function appDir(appId: number): string {
  return `github/apps/${appId}`
}

export function writeGithubApp(deploymentId: string, app: CreatedGithubApp): string {
  const { pem, ...metadata } = app
  const pemPath = writeDeploymentFile(deploymentId, `${appDir(app.app_id)}/secret.pem`, pem)
  writeDeploymentFile(
    deploymentId,
    `${appDir(app.app_id)}/app.json`,
    JSON.stringify(metadata, null, 2) + '\n',
  )
  return pemPath
}

export function readGithubApp(deploymentId: string): CreatedGithubApp | null {
  const appIds = listDeploymentDir(deploymentId, 'github/apps')
  if (appIds.length === 0) return null
  // One app per deployment today; take the newest if several exist.
  const appId = appIds.sort().at(-1)!
  const metaRaw = readDeploymentFile(deploymentId, `github/apps/${appId}/app.json`)
  const pem = readDeploymentFile(deploymentId, `github/apps/${appId}/secret.pem`)
  if (!metaRaw || pem === null) return null
  try {
    return { ...(JSON.parse(metaRaw) as Omit<CreatedGithubApp, 'pem'>), pem }
  } catch {
    return null
  }
}
