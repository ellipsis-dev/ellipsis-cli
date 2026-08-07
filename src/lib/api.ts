import { resolveLicenseBase, USER_AGENT } from './constants'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message)
  }
}

async function apiFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const { timeoutMs, ...rest } = init
  const res = await fetch(`${resolveLicenseBase()}${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT, ...rest.headers },
    signal: AbortSignal.timeout(timeoutMs ?? 15_000),
  })
  if (!res.ok) {
    // The license service puts customer-facing messages in `detail` (e.g. the
    // 424 "role not assumable yet" explanation) — surface it.
    let detail: string | undefined
    try {
      detail = ((await res.json()) as { detail?: string }).detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, detail)
  }
  return res.json()
}

export interface RegisterRequest {
  email: string
  company: string
  developer_count: number
  aws_account_id: string
  github_org: string
  cli_version: string
}

// Mirrors license_service/app/main.py RegisterDeploymentResponse — change
// both together. `token` (ellipsis_dtoken_…) is returned exactly once; the
// server stores only its hash.
export interface RegisterResponse {
  deployment_id: string
  token: string
  expires_at: string
}

export async function registerDeployment(req: RegisterRequest): Promise<RegisterResponse> {
  return (await apiFetch('/v1/deployments/register', {
    method: 'POST',
    body: JSON.stringify(req),
  })) as RegisterResponse
}

export interface DeployResponse {
  run_id: string
  status: string
}

/**
 * Ask the license service to deploy into the customer account. 424 = the
 * cross-account role isn't assumable yet (stack still creating / not created)
 * — the wizard lets the customer retry; 409 = a run is already in flight.
 */
export async function startDeployment(deploymentId: string, token: string): Promise<DeployResponse> {
  return (await apiFetch(`/v1/deployments/${deploymentId}/deploy`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    // The server verifies the role with a live STS round-trip before
    // answering; give it headroom past the default.
    timeoutMs: 30_000,
  })) as DeployResponse
}

export interface DeploymentStatus {
  deployment_id: string
  status: 'registered' | 'scheduled' | 'running' | 'succeeded' | 'failed'
  error: string | null
  role_arn: string | null
  expires_at: string
}

export async function getDeploymentStatus(deploymentId: string, token: string): Promise<DeploymentStatus> {
  return (await apiFetch(`/v1/deployments/${deploymentId}`, {
    headers: { authorization: `Bearer ${token}` },
  })) as DeploymentStatus
}
