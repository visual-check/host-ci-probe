// Research: does the browser container go when visual-check is killed, per host OS? Windows has no signals: Node's
// kill() is TerminateProcess, and children outlive their parent unless killed as a tree.
//   node kill-check.mjs <base> <out dir>     (VC_DOCKER and the other docker.ts variables apply)
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCKER, dockerArgs } from './docker.ts'

const [base, outArg] = process.argv.slice(2)
const out = path.resolve(outArg)
mkdirSync(out, { recursive: true })
const H = path.dirname(fileURLToPath(import.meta.url))
const win = process.platform === 'win32'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const docker = (args) => { try { return execFileSync(DOCKER[0], dockerArgs(args), { encoding: 'utf8' }).trim() } catch (e) { return `ERR ${String(e.stderr ?? e.message).trim().slice(0, 200)}` } }
// docker ps, or wslc's list where ps doesn't exist
const running = (name) => {
  let out = docker(['ps', '-a', '--format', '{{.Names}}'])
  if (out.startsWith('ERR')) out = docker(['container', 'list', '--all'])
  return out.split(/\r?\n/).filter((l) => l.includes(name)).length
}
const clients = () => {
  if (!win) return execFileSync('sh', ['-c', "pgrep -fl 'docker run' | grep -c vc-kill || true"], { encoding: 'utf8' }).trim()
  const ps = "Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'vc-kill' -and $_.Name -match '^(docker|wsl)' } | % { $_.Name }"
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).join(',') || 'none'
}
const kills = win
  ? { 'TerminateProcess (kill())': (c) => c.kill(), 'taskkill /T /F': (c) => execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }) }
  : { SIGKILL: (c) => c.kill('SIGKILL'), SIGTERM: (c) => c.kill('SIGTERM'), 'SIGINT to the group': (c) => process.kill(-c.pid, 'SIGINT') }
const drivers = { raw: ['--driver', 'raw'], 'webkit-attached': ['--driver', 'pw-webkit', '--pw-mode', 'attached'] }
const results = []
let port = 3350
for (const [driver, dargs] of Object.entries(drivers))
  for (const [how, kill] of Object.entries(kills)) {
    const label = `${driver}-${how.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.replace(/-+$/, '')
    const name = `vc-kill-${label}`
    const log = path.join(out, `${label}.log`)
    const child = spawn(process.execPath, [path.join(H, 'capture.ts'), '--base', base, '--out', path.join(out, label), '--name', name, '--port', String(port++), ...dargs, ...process.argv.slice(4)], {
      stdio: ['ignore', openSync(log, 'w'), openSync(log, 'a')],
      detached: !win,
    })
    let k = 0
    while (!readFileSync(log, 'utf8').includes('launched') && k++ < 600) await sleep(200)
    await sleep(3000)
    const before = running(`${name}-1`)
    const clientsBefore = clients()
    const t0 = performance.now()
    kill(child)
    let goneMs = null
    for (let i = 0; i < 150; i++) { if (!running(`${name}-1`)) { goneMs = Math.round(performance.now() - t0); break } await sleep(200) }
    const r = { driver, kill: how, containerBefore: before, goneMs, clientsBefore, clientsAfter: clients() }
    if (goneMs === null) { r.still = docker(['ps', '-a', '--format', '{{.Names}} {{.Status}}', '-f', `name=${name}`]); docker(['rm', '-f', `${name}-1`]) }
    console.log(JSON.stringify(r))
    results.push(r)
    await sleep(1000)
  }
console.log(`left over: ${docker(['ps', '-a', '--format', '{{.Names}}', '-f', 'name=vc-kill']) || 'none'}`)
