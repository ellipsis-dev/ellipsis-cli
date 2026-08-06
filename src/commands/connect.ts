import { execFile } from 'node:child_process'
import type { Command } from 'commander'
import {
  createAppViaManifest,
  readGithubApp,
  writeGithubApp,
} from '../lib/github_app'
import { ask, askYes, closePrompts, openPrompts } from '../lib/prompt'
import { validateGithubOrg } from '../lib/validate'

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  execFile(cmd, [url], (err) => {
    if (err) console.log(`Could not open a browser automatically. Visit:\n  ${url}`)
  })
}

export function registerConnect(program: Command): void {
  const connect = program.command('connect').description('Connect Ellipsis to your tools')

  connect
    .command('github')
    .description("Create your company's GitHub App and install it on your organization")
    .option('--org <org>', 'GitHub organization the app will belong to')
    .option('--domain <domain>', 'the domain your Ellipsis installation will use, e.g. ellipsis.acme.com')
    .option('--app-name <name>', 'name for the created GitHub App (default: "Ellipsis for <org>")')
    .action(async (opts: { org?: string; domain?: string; appName?: string }) => {
      openPrompts()
      try {
        await runConnectGithub(opts)
      } finally {
        closePrompts()
      }
    })
}

async function runConnectGithub(opts: {
  org?: string
  domain?: string
  appName?: string
}): Promise<void> {
  const existing = readGithubApp()
  if (existing) {
    console.log(
      `A GitHub App is already connected: ${existing.name} (app ${existing.app_id},` +
        ` owned by ${existing.owner_login}).\n` +
        `Manage it at ${existing.html_url}. Delete ~/.ellipsis/github-app.json to reconnect.`,
    )
    process.exitCode = 1
    return
  }

  const org = opts.org ?? (await ask('Which GitHub organization will own the app?', validateGithubOrg))
  const domain =
    opts.domain ??
    (await ask(
      'What domain will your Ellipsis installation use? (e.g. ellipsis.acme.com — DNS does' +
        ' not need to exist yet)',
      (input) => {
        const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
        if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
          return new Error('That does not look like a domain, e.g. ellipsis.acme.com.')
        }
        return d
      },
    ))
  const appName = opts.appName ?? `Ellipsis for ${org}`

  console.log(
    `\nAbout to create a GitHub App:\n` +
      `  name:     ${appName}\n` +
      `  owner:    ${org} (requires an organization owner)\n` +
      `  webhooks: https://api.${domain}/github/webhook\n\n` +
      'Your browser will open a GitHub page showing the app and its permissions.\n' +
      'One click there creates it; the credentials come back to this terminal directly.\n',
  )
  await askYes('Ready?')

  console.log('\nWaiting for you to click "Create GitHub App" in the browser...')
  const app = await createAppViaManifest(
    {
      org,
      appName,
      webhookUrl: `https://api.${domain}/github/webhook`,
      homepageUrl: `https://app.${domain}`,
    },
    { openBrowser },
  )

  const savedTo = writeGithubApp(app)
  console.log(
    `\nCreated ${app.name} (app ${app.app_id}, owned by ${app.owner_login}).\n` +
      `Credentials saved to ${savedTo} — the deploy step moves them into your AWS Secrets Manager.\n`,
  )

  console.log('Last part: install the app on your organization and choose repositories.')
  openBrowser(`https://github.com/apps/${app.slug}/installations/new`)
  console.log(
    `If the browser did not open: https://github.com/apps/${app.slug}/installations/new\n\n` +
      'Once installed, GitHub connection is complete. (Your installation will sync' +
      ' repositories when it deploys.)',
  )
}
