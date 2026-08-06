import type { Command } from 'commander'
import { readGithubApp } from '../lib/github_app'
import { readState } from '../lib/state'

// `ellipsis init` is the wizard and the normal path. `connect` exists only to
// inspect or point at the right re-entry: connection steps read their inputs
// from install state, so they run inside the wizard, never from flags.
export function registerConnect(program: Command): void {
  const connect = program.command('connect').description('Connection status for your install')

  connect
    .command('github')
    .description('Show GitHub App connection status')
    .action(() => {
      const state = readState()
      if (!state) {
        console.log('No install in progress. Run `ellipsis init` to get started.')
        process.exitCode = 1
        return
      }
      const app = readGithubApp()
      if (app) {
        console.log(
          `Connected: ${app.name} (app ${app.app_id}, owned by ${app.owner_login}).\n` +
            `Manage it at ${app.html_url}.`,
        )
      } else {
        console.log(
          `Not connected. Run \`ellipsis init\` to continue — it will resume at the` +
            ` GitHub step for ${state.github_org}.`,
        )
        process.exitCode = 1
      }
    })
}
