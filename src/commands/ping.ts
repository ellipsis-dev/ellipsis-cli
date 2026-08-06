import type { Command } from 'commander'
import { resolveLicenseBase, USER_AGENT } from '../lib/constants'

export function registerPing(program: Command): void {
  program
    .command('ping')
    .description('Check that license.ellipsis.dev is reachable')
    .action(async () => {
      const base = resolveLicenseBase()
      const url = `${base}/v1/health`
      const startedAt = Date.now()
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        })
        const ms = Date.now() - startedAt
        if (res.ok) {
          console.log(`ok: ${new URL(base).host} (${ms}ms)`)
        } else {
          console.error(`ping failed: ${res.status} ${res.statusText}`)
          process.exitCode = 1
        }
      } catch (err) {
        // Network/DNS/timeout: never got an HTTP response.
        console.error(`cannot reach ${new URL(base).host}: ${(err as Error).message}`)
        process.exitCode = 1
      }
    })
}
