import { currentDeploymentId, readDeploymentFile, writeDeploymentFile } from './paths'

// The install state: every answer the wizard has collected and how far it has
// gotten, at ~/.ellipsis/deployments/{id}/install-state.json. Written after
// each completed step so `ellipsis init` is resumable — later steps read
// answers from here and never re-ask. Key material lives elsewhere (see
// paths.ts for the layout).
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

const REL_PATH = 'install-state.json'

export function readState(): InstallState | null {
  const id = currentDeploymentId()
  if (!id) return null
  const raw = readDeploymentFile(id, REL_PATH)
  if (!raw) return null
  try {
    return JSON.parse(raw) as InstallState
  } catch {
    return null
  }
}

/** State is deployment-scoped: it can only be written once Step 1 minted the id. */
export function writeState(deploymentId: string, state: InstallState): void {
  writeDeploymentFile(deploymentId, REL_PATH, JSON.stringify(state, null, 2) + '\n')
}
