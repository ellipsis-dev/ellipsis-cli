import pkg from '../../package.json'

// The version, in precedence order:
// 1. BUILD_GIT_VERSION — stamped by scripts/compile.sh (`bun run compile`)
//    from `git describe`, so a locally built binary reports exactly the
//    commit it was built from ("0.1.0-2-g08ea24d") instead of package.json's
//    stale field (the release workflow rewrites it at tag time).
// 2. pkg.version — release builds and tsx dev runs.
declare const BUILD_GIT_VERSION: string | undefined
export const VERSION: string =
  typeof BUILD_GIT_VERSION === 'string' ? BUILD_GIT_VERSION : pkg.version

// Sent on every request to license.ellipsis.dev so we can tell which CLI
// version an install is running from.
export const USER_AGENT = `ellipsis-cli/${VERSION}`

// The bare default; ELLIPSIS_LICENSE_BASE_URL takes precedence (so the CLI
// can be pointed at a local license API during development).
export const DEFAULT_LICENSE_BASE = 'https://license.ellipsis.dev'

export function resolveLicenseBase(): string {
  return process.env.ELLIPSIS_LICENSE_BASE_URL ?? DEFAULT_LICENSE_BASE
}
