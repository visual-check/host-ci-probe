// Research: N passes, round robin over arms, each a full capture run of the Storybook at <base>. Works on every host OS.
//   node arms.mjs <base> <out root> <passes> <arm>=<capture.ts arguments, space-separated>...
// e.g. node arms.mjs http://127.0.0.1:6400 out/runs 5 "chromium-live=--driver raw" "chromium-offline=--driver raw --offline"
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [base, outArg, passes, ...specs] = process.argv.slice(2)
const H = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(outArg)
const arms = specs.map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).split(' ').filter(Boolean)] })
for (let i = 1; i <= Number(passes); i++)
  for (const [arm, args] of arms) {
    const dir = path.join(out, arm, `run-${i}`)
    if (existsSync(path.join(dir, 'run.json'))) continue
    mkdirSync(path.join(out, arm), { recursive: true })
    console.log(`### pass ${i} ${arm} ${new Date().toISOString().slice(11, 19)}`)
    const r = spawnSync(process.execPath, [path.join(H, 'capture.ts'), ...args, '--base', base, '--out', dir, '--label', `${arm}-${i}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
    writeFileSync(path.join(out, arm, `run-${i}.err`), r.stderr ?? '')
    console.log((r.stdout ?? '').trim().slice(0, 400) || `no output, exit ${r.status}: ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}`)
  }
