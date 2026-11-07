// Research: is `docker run -i` a byte-exact pipe from this host? Sends 4 MiB of random bytes, with NUL, CR, LF,
// CRLF, Ctrl-P and Ctrl-Q (Docker's detach keys) mixed in, through `cat` in a container, and compares what comes back.
//   node pipe-probe.mjs <label> <command> [args...]     e.g. node pipe-probe.mjs tcp docker run -i --rm IMAGE cat
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'

const [label, cmd, ...args] = process.argv.slice(2)
const data = randomBytes(4 << 20)
for (let i = 0; i < data.length; i += 997) data.set(Buffer.from([0, 13, 10, 13, 10, 0x10, 0x11, 0]), i)
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const t0 = performance.now()
const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
const chunks = []
let err = ''
child.stdout.on('data', (c) => chunks.push(c))
child.stderr.on('data', (c) => { err += c })
child.stdin.on('error', () => {})
child.on('error', (e) => { err += `spawn error ${e.code}` })
child.stdin.end(data)
const code = await new Promise((r) => { child.on('close', r); setTimeout(() => { child.kill(); r('timeout') }, 120_000) })
const got = Buffer.concat(chunks)
console.log(JSON.stringify({ label, code, sent: data.length, received: got.length, identical: got.equals(data), sentSha: sha(data), receivedSha: sha(got), firstDiffAt: got.equals(data) ? null : [...got].findIndex((b, i) => b !== data[i]), ms: Math.round(performance.now() - t0), stderr: err.trim().slice(-300) }))
