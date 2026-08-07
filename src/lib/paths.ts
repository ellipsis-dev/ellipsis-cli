import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Everything the CLI stores lives under the deployment it belongs to:
//
//   ~/.ellipsis/
//     current-deployment            (the deployment id later commands act on)
//     deployments/{id}/
//       credentials.json            (install credential from /v1/installs/register)
//       install-state.json          (wizard answers + progress)
//       github/apps/{app_id}/
//         app.json                  (app metadata, no key material)
//         secret.pem                (the app's private key, until the deploy
//                                    step moves it into their Secrets Manager)
//
// The deployment id is the install_id the license service mints, so nothing
// exists on disk before Step 1 succeeds.

export const ELLIPSIS_DIR = path.join(os.homedir(), '.ellipsis')
const CURRENT_PATH = path.join(ELLIPSIS_DIR, 'current-deployment')

export function deploymentDir(deploymentId: string): string {
  return path.join(ELLIPSIS_DIR, 'deployments', deploymentId)
}

export function setCurrentDeployment(deploymentId: string): void {
  fs.mkdirSync(ELLIPSIS_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(CURRENT_PATH, deploymentId + '\n', { mode: 0o600 })
}

export function currentDeploymentId(): string | null {
  try {
    const id = fs.readFileSync(CURRENT_PATH, 'utf8').trim()
    return id.length > 0 ? id : null
  } catch {
    return null
  }
}

/** Write a file under the deployment dir, creating parents 700, file 600. */
export function writeDeploymentFile(deploymentId: string, relPath: string, content: string): string {
  const abs = path.join(deploymentDir(deploymentId), relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 })
  fs.writeFileSync(abs, content, { mode: 0o600 })
  return abs
}

export function readDeploymentFile(deploymentId: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(deploymentDir(deploymentId), relPath), 'utf8')
  } catch {
    return null
  }
}

export function listDeploymentDir(deploymentId: string, relPath: string): string[] {
  try {
    return fs.readdirSync(path.join(deploymentDir(deploymentId), relPath))
  } catch {
    return []
  }
}
