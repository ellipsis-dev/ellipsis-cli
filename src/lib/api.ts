import { resolveLicenseBase, USER_AGENT } from './constants'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface RegisterRequest {
  email: string
  company: string
  developer_count: number
  aws_account_id: string
  github_org: string
  cli_version: string
}

export interface RegisterResponse {
  install_id: string
  install_credential: string
}

export async function registerInstall(req: RegisterRequest): Promise<RegisterResponse> {
  const res = await fetch(`${resolveLicenseBase()}/v1/installs/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RegisterResponse
}
