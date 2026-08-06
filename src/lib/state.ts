import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// The install state: every answer the wizard has collected and how far it has
// gotten. Written after each completed step so `ellipsis init` is resumable —
// later steps read answers from here and never re-ask. Credentials live in
// their own files (credentials.json, github-app.json), not here.
export interface InstallState {
  // Step 1 answers.
  email: string
  company: string
  developer_count: number
  aws_account_id: string
  github_org: string
  domain: string
  // Number of completed steps (1 = trial started, 2 = GitHub connected, ...).
  completed_steps: number
}

const STATE_DIR = path.join(os.homedir(), '.ellipsis')
const STATE_PATH = path.join(STATE_DIR, 'install-state.json')

export function readState(): InstallState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as InstallState
  } catch {
    return null
  }
}

export function writeState(state: InstallState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
}
