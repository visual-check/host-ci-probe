// Research: can the agent skill's script start a project's Storybook and stop everything it started, per host OS?
// Starts `yarn storybook --ci` in a mealdrop checkout, waits for index.json, stops it in several ways, and reports
// whether the port is free and which processes are left.
//   node startstop-check.mjs <mealdrop dir>
import { execFileSync, spawn } from 'node:child_process'

const cwd = process.argv[2]
const win = process.platform === 'win32'
const PORT = 6006
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const up = async () => {
  for (const host of ['127.0.0.1', '[::1]']) {
    try { if ((await fetch(`http://${host}:${PORT}/index.json`, { signal: AbortSignal.timeout(2000) })).ok) return host } catch {}
  }
  return null
}
// processes whose command line mentions storybook, besides this script
const leftovers = () => {
  try {
    if (win) {
      const ps = "Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'storybook' -and $_.CommandLine -notmatch 'startstop-check' } | % { \"$($_.ProcessId) $($_.Name) $($_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)))\" }"
      return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
    }
    return execFileSync('pgrep', ['-fl', 'storybook'], { encoding: 'utf8' }).trim().split('\n').filter((l) => l && !l.includes('startstop-check'))
  } catch { return [] }
}
const cleanup = () => {
  for (const l of leftovers()) {
    const pid = Number(l.split(' ')[0])
    try { win ? execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) : process.kill(pid, 'SIGKILL') } catch {}
  }
}
const report = { platform: process.platform, node: process.version }

// Node refuses .cmd and .bat without a shell on Windows (CVE-2024-27980), and yarn is a .cmd shim there
report.spawnWithoutShell = {}
for (const cmd of win ? ['yarn', 'yarn.cmd'] : ['yarn']) {
  try {
    const c = spawn(cmd, ['--version'], { cwd })
    report.spawnWithoutShell[cmd] = await new Promise((r) => { c.on('error', (e) => r(`error ${e.code}`)); c.on('exit', (code) => r(`exit ${code}`)) })
  } catch (e) { report.spawnWithoutShell[cmd] = `throws ${e.code}` }
}

async function start() {
  const t0 = performance.now()
  // detached on POSIX makes a process group, so the whole tree can be signalled; on Windows it would open a console
  const child = spawn('yarn storybook --ci', { cwd, shell: true, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => { log = (log + d).slice(-2000) })
  child.stderr.on('data', (d) => { log = (log + d).slice(-2000) })
  for (let k = 0; k < 180; k++) {
    const host = await up()
    if (host) return { child, host, startS: Math.round((performance.now() - t0) / 100) / 10 }
    if (child.exitCode !== null) break
    await sleep(1000)
  }
  return { child, error: `not up: ${log.slice(-300)}` }
}
const methods = win
  ? { 'child.kill()': (c) => c.kill(), 'taskkill /T /F': (c) => { try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} } }
  : { 'child.kill() SIGTERM': (c) => c.kill('SIGTERM'), 'group SIGTERM': (c) => process.kill(-c.pid, 'SIGTERM'), 'group SIGINT': (c) => process.kill(-c.pid, 'SIGINT') }
report.stops = {}
for (const [label, stop] of Object.entries(methods)) {
  cleanup()
  const s = await start()
  if (s.error) { report.stops[label] = s.error; continue }
  const before = leftovers().length
  stop(s.child)
  let freedS = null
  for (let k = 0; k < 20; k++) { await sleep(500); if (!(await up())) { freedS = (k + 1) / 2; break } }
  const left = leftovers()
  report.stops[label] = { startS: s.startS, host: s.host, processesBefore: before, portFreedAfterS: freedS, left: left.length, sample: left.slice(0, 4) }
}
cleanup()
console.log(JSON.stringify(report, null, 1))
process.exit(0)
