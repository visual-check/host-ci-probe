// Research: can a container reach a server on this host, and is the host's 127.0.0.1 enough? Starts two HTTP servers
// here, one on all interfaces and one on loopback only, then fetches each from a container.
//   node reach-probe.mjs <label> <image> <host name> [<ip for --add-host> | -] [hostnet]
// Docker is reached through docker.ts (VC_DOCKER).
import { spawn } from 'node:child_process'
import http from 'node:http'
import { DOCKER, dockerArgs } from './docker.ts'

const [label, image, hostName, addHost = '-', mode = ''] = process.argv.slice(2)
const serve = (host, port) => new Promise((r) => { const s = http.createServer((_q, res) => res.end(`ok ${host}`)); s.on('error', (e) => r(`listen ${e.code}`)); s.listen(port, host, () => r(s)) })
await serve('0.0.0.0', 6411)
await serve('127.0.0.1', 6412)
const fetchIn = (url, extra) => new Promise((r) => {
  const js = `fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(8000)}).then(async x=>console.log(x.status+' '+await x.text()),e=>console.log('ERR '+(e.cause?.code||e.name)))`
  const t0 = performance.now()
  const c = spawn(DOCKER[0], dockerArgs(['run', '-i', '--rm', ...extra, '--entrypoint', 'node', image, '-']), { stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  c.stdout.on('data', (d) => { out += d })
  c.stderr.on('data', (d) => { err += d })
  c.on('error', (e) => { err += e.message })
  const timer = setTimeout(() => c.kill(), 60_000)
  c.on('close', (code) => { clearTimeout(timer); r({ url, extra: extra.join(' '), result: out.trim() || `ERR exit ${code} ${err.trim().slice(-200)}`, ms: Math.round(performance.now() - t0) }) })
  c.stdin.end(js)
})
const add = addHost !== '-' ? [`--add-host=${hostName}:${addHost}`] : []
const results = [await fetchIn(`http://${hostName}:6411/`, add), await fetchIn(`http://${hostName}:6412/`, add)]
if (mode === 'hostnet') results.push(await fetchIn('http://127.0.0.1:6412/', ['--network', 'host']), await fetchIn('http://127.0.0.1:6411/', ['--network', 'host']))
for (const r of results) console.log(JSON.stringify({ label, ...r }))
process.exit(0)
