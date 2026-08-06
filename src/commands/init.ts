import { execFile } from 'node:child_process'
import type { Command } from 'commander'
import { ApiError, registerInstall } from '../lib/api'
import { INSTALL_STEPS, renderChecklist } from '../lib/checklist'
import { VERSION } from '../lib/constants'
import { writeCredentials } from '../lib/credentials'
import { createAppViaManifest, writeGithubApp } from '../lib/github_app'
import { ask, askYes, closePrompts, openPrompts } from '../lib/prompt'
import { readState, writeState, type InstallState } from '../lib/state'
import {
  validateAwsAccountId,
  validateCompany,
  validateDeveloperCount,
  validateDomain,
  validateEmail,
  validateGithubOrg,
} from '../lib/validate'

const WELCOME = `
This CLI can help you deploy Ellipsis.dev's Cloud Platform for Coding Agents
in your own AWS account. After, you'll be able to deploy fleets of SWE agents
without any credentials or code leaving your AWS VPC.

You can use the platform for free for 7 days. After, you'll pay platform fees
(typically 40% of token usage) in accordance with our license.

Get in touch with us at team@ellipsis.dev or schedule a call at
cal.com/ellipsis/demo if you have questions. We offer free Slack support
during the install process. You can set that up in a minute.

This process takes about two hours, but most of that time is waiting for AWS
to provision resources.
`

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Deploy Ellipsis into your own AWS account')
    .action(async () => {
      // Open stdin buffering before any output so piped input is never dropped.
      openPrompts()
      try {
        await runInit()
      } catch (err) {
        if ((err as Error).message === 'stdin closed') {
          console.error('\nInput ended before the wizard finished.')
          process.exitCode = 1
        } else {
          throw err
        }
      } finally {
        closePrompts()
      }
    })
}

// The wizard: fresh runs start at Step 1; every later `ellipsis init` resumes
// at the first incomplete step, reading answers from install state — a step
// never re-asks what an earlier step already learned.
async function runInit(): Promise<void> {
  const state = readState()

  if (!state) {
    console.log(WELCOME)
    console.log('Here is what we will do together:\n')
    console.log(renderChecklist(0))
    console.log()
    await askYes('Are you ready to get started?')
    const fresh = await stepStartTrial()
    if (fresh) await continueFrom(fresh)
    return
  }

  console.log(`\nWelcome back. Resuming your Ellipsis install for ${state.company}.\n`)
  console.log(renderChecklist(state.completed_steps))
  console.log()
  if (state.completed_steps >= INSTALL_STEPS.length) {
    console.log('Your install is complete.')
    return
  }
  await continueFrom(state)
}

/** Run steps from the first incomplete one; stop at the first not-yet-built step. */
async function continueFrom(state: InstallState): Promise<void> {
  let current = state
  while (current.completed_steps < INSTALL_STEPS.length) {
    const next = current.completed_steps // 0-indexed
    await askYes(`Continue with Step ${next + 1} (${INSTALL_STEPS[next].title})?`)
    switch (next) {
      case 1:
        current = await stepConnectGithub(current)
        break
      default:
        console.log(
          `\nStep ${next + 1} (${INSTALL_STEPS[next].title}) is not built yet — coming soon.`,
        )
        return
    }
  }
}

/** Step 1: collect identity, mint the trial, persist credential + state. */
async function stepStartTrial(): Promise<InstallState | null> {
  console.log(`\nStep 1: ${INSTALL_STEPS[0].title}\n`)

  const email = await ask('What is your work email?', validateEmail)
  const company = await ask(
    "What is the name of the company that you'd like to use Ellipsis in?",
    validateCompany,
  )
  const developerCount = await ask(`How many developers work at ${company}?`, validateDeveloperCount)
  const awsAccountId = await ask(
    "What is the AWS Account ID you'd like to deploy Ellipsis in?",
    validateAwsAccountId,
  )
  const domain = await ask(
    'What domain will your Ellipsis installation use? (e.g. ellipsis.acme.com — you will' +
      ' delegate DNS to AWS during the deploy step; nothing needs to exist yet)',
    validateDomain,
  )
  const githubOrg = await ask(
    "What is the name of the GitHub organization you'd like to connect your self-hosted" +
      ' Ellipsis installation to? If your company has many GitHub organizations, just choose' +
      ' one for now. You can add more later.',
    validateGithubOrg,
  )
  // The next step creates an org-owned GitHub App, which only an org owner can
  // do — recruit that person now, not after the deploy.
  console.log(
    `The next step creates a GitHub App owned by ${githubOrg}, which requires an` +
      ` organization owner (check https://github.com/orgs/${githubOrg}/people and` +
      ' filter by role: Owner).\n',
  )
  await askYes(`Are you an owner of ${githubOrg}, or is one with you?`)
  console.log()

  console.log('Starting your free trial...')
  try {
    const res = await registerInstall({
      email,
      company,
      developer_count: developerCount,
      aws_account_id: awsAccountId,
      github_org: githubOrg,
      cli_version: VERSION,
    })
    writeCredentials({
      install_id: res.install_id,
      install_credential: res.install_credential,
      registered_at: new Date().toISOString(),
    })
  } catch (err) {
    const reason =
      err instanceof ApiError
        ? `the license service answered ${err.status}`
        : `cannot reach the license service: ${(err as Error).message}`
    console.error(
      `\nCould not start your trial (${reason}).\n` +
        'Nothing was created. Please try again shortly, or contact team@ellipsis.dev.',
    )
    process.exitCode = 1
    return null
  }

  const state: InstallState = {
    email,
    company,
    developer_count: developerCount,
    aws_account_id: awsAccountId,
    github_org: githubOrg,
    domain,
    completed_steps: 1,
  }
  writeState(state)
  console.log('Trial active: 7 days.\n')
  console.log(renderChecklist(1))
  console.log()
  return state
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  execFile(cmd, [url], (err) => {
    if (err) console.log(`Could not open a browser automatically. Visit:\n  ${url}`)
  })
}

/** Step 2: create their GitHub App via the manifest flow. All inputs come from state. */
async function stepConnectGithub(state: InstallState): Promise<InstallState> {
  const { github_org: org, domain } = state
  const appName = `Ellipsis for ${org}`

  console.log(
    `\nStep 2: ${INSTALL_STEPS[1].title}\n\n` +
      `We will create a GitHub App for your company:\n` +
      `  name:     ${appName}\n` +
      `  owner:    ${org}\n` +
      `  webhooks: https://api.${domain}/github/webhook\n\n` +
      'Your browser will open a GitHub page showing the app and its permissions.\n' +
      'One click there creates it; the credentials come back to this terminal directly\n' +
      'and never pass through Ellipsis.\n',
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
  writeGithubApp(app)
  console.log(`\nCreated ${app.name} (app ${app.app_id}, owned by ${app.owner_login}).`)
  console.log(
    'Credentials saved locally — the deploy step moves them into your AWS Secrets Manager.\n',
  )

  console.log(`Last part: install the app on ${org} and choose repositories.`)
  const installUrl = `https://github.com/apps/${app.slug}/installations/new`
  openBrowser(installUrl)
  await askYes(`Done installing? (${installUrl})`)

  const updated: InstallState = { ...state, completed_steps: 2 }
  writeState(updated)
  console.log()
  console.log(renderChecklist(2))
  console.log()
  return updated
}
