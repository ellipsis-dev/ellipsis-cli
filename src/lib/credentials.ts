import {
  currentDeploymentId,
  readDeploymentFile,
  setCurrentDeployment,
  writeDeploymentFile,
} from './paths'

// The install credential issued by POST /v1/installs/register. It IS the
// deployment identity: writing it also points current-deployment at it.
// Lives at ~/.ellipsis/deployments/{id}/credentials.json, chmod 600.
export interface StoredCredentials {
  install_id: string
  install_credential: string
  registered_at: string
}

const REL_PATH = 'credentials.json'

export function readCredentials(): StoredCredentials | null {
  const id = currentDeploymentId()
  if (!id) return null
  const raw = readDeploymentFile(id, REL_PATH)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredCredentials
  } catch {
    return null
  }
}

export function writeCredentials(creds: StoredCredentials): string {
  const path = writeDeploymentFile(creds.install_id, REL_PATH, JSON.stringify(creds, null, 2) + '\n')
  setCurrentDeployment(creds.install_id)
  return path
}
