import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// The install credential issued by POST /v1/installs/register. Stored at
// ~/.ellipsis/credentials.json, chmod 600 — it authenticates every later call
// to license.ellipsis.dev for this install.
export interface StoredCredentials {
  install_id: string
  install_credential: string
  registered_at: string
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.ellipsis')
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json')

export function readCredentials(): StoredCredentials | null {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) as StoredCredentials
  } catch {
    return null
  }
}

export function writeCredentials(creds: StoredCredentials): string {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 })
  return CREDENTIALS_PATH
}
