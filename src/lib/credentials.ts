import {
  currentDeploymentId,
  readDeploymentFile,
  setCurrentDeployment,
  writeDeploymentFile,
} from './paths'

// The deployment credential issued by POST /v1/deployments/register: the
// ellipsis_dtoken_… bearer token every deployment-scoped call carries. It IS
// the deployment identity: writing it also points current-deployment at it.
// Lives at ~/.ellipsis/deployments/{id}/credentials.json, chmod 600. The
// server stores only the token's hash, so this file is the only copy.
export interface StoredCredentials {
  deployment_id: string
  token: string
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
  const path = writeDeploymentFile(creds.deployment_id, REL_PATH, JSON.stringify(creds, null, 2) + '\n')
  setCurrentDeployment(creds.deployment_id)
  return path
}
