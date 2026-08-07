import type { Command } from 'commander'
import { ApiError, registerInstall } from '../lib/api'
import { INSTALL_STEPS, renderChecklist } from '../lib/checklist'
import { VERSION } from '../lib/constants'
import { readCredentials, writeCredentials } from '../lib/credentials'
import { ask, askYes, closePrompts, openPrompts } from '../lib/prompt'
import {
  validateAwsAccountId,
  validateCompany,
  validateDeveloperCount,
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
          console.error('\nInput ended before the wizard finished. Nothing was created.')
          process.exitCode = 1
        } else {
          throw err
        }
      } finally {
        closePrompts()
      }
    })
}

async function runInit(): Promise<void> {
  const existing = readCredentials()
  if (existing) {
    console.log(
      `This machine already has an install credential (install ${existing.install_id},` +
        ` registered ${existing.registered_at}).\n` +
        'Continuing would register a NEW install. Contact team@ellipsis.dev if you need to reset.',
    )
    process.exitCode = 1
    return
  }

  console.log(WELCOME)
  console.log('Here is what we will do together:\n')
  console.log(renderChecklist(0))
  console.log()
  await askYes('Are you ready to get started?')

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
    const path = writeCredentials({
      install_id: res.install_id,
      install_credential: res.install_credential,
      registered_at: new Date().toISOString(),
    })
    console.log(`Trial active: 7 days. Credential saved to ${path}.\n`)
    console.log(renderChecklist(1))
    console.log('\nNext: `ellipsis init` will continue with Step 2 (coming soon).')
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
  }
}
