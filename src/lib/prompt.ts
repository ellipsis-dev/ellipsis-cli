import * as readline from 'node:readline'

// Prompting over stdin with a line QUEUE rather than bare rl.question().
// Why: with piped input (tests, scripts), all lines arrive at once — lines
// that land before a question() call is registered would be silently dropped,
// and EOF would exit the process mid-wizard with code 0. The queue buffers
// every line as it arrives; ask() consumes them in order, and EOF while a
// question is pending is a loud error instead of a silent exit.

let rl: readline.Interface | null = null
const lineQueue: string[] = []
let pendingResolve: ((line: string) => void) | null = null
let pendingReject: ((err: Error) => void) | null = null
let closed = false

function iface(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.on('line', (line) => {
      if (pendingResolve) {
        const resolve = pendingResolve
        pendingResolve = null
        pendingReject = null
        resolve(line)
      } else {
        lineQueue.push(line)
      }
    })
    rl.on('close', () => {
      closed = true
      if (pendingReject) {
        const reject = pendingReject
        pendingResolve = null
        pendingReject = null
        reject(new Error('stdin closed'))
      }
    })
  }
  return rl
}

function nextLine(prompt: string): Promise<string> {
  process.stdout.write(prompt)
  const queued = lineQueue.shift()
  if (queued !== undefined) {
    // Echo what an interactive user would have typed, so transcripts read the same.
    process.stdout.write(`${queued}\n`)
    return Promise.resolve(queued)
  }
  if (closed) return Promise.reject(new Error('stdin closed'))
  iface()
  return new Promise((resolve, reject) => {
    pendingResolve = resolve
    pendingReject = reject
  })
}

export function openPrompts(): void {
  iface()
}

export function closePrompts(): void {
  rl?.close()
  rl = null
}

/** Ask until the validator accepts; print the validator's message on reject. */
export async function ask<T>(
  question: string,
  validate: (input: string) => T | Error,
): Promise<T> {
  for (;;) {
    const answer = await nextLine(`${question}\n> `)
    const result = validate(answer)
    if (result instanceof Error) {
      console.log(`  ${result.message}\n`)
      continue
    }
    console.log()
    return result
  }
}

/** Ask until the user types yes (y/yes, case-insensitive). Refuses anything else. */
export async function askYes(question: string): Promise<void> {
  for (;;) {
    const answer = (await nextLine(`${question} `)).trim().toLowerCase()
    if (answer === 'yes' || answer === 'y') return
    console.log('  Please type "yes" to continue (or Ctrl-C to exit).\n')
  }
}
