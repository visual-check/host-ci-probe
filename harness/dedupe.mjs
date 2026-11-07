// Research: keeps each distinct snapshot once. <runs>/<arm>/run-N/png/<cell>.png becomes <out>/png/<sha1>.png,
// plus <out>/manifest.json {arm: {run: {cell: sha1}}}. A Node port of the proxy-scope branch's dedupe.py.
//   node dedupe.mjs <runs> <out>
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [runs, out] = process.argv.slice(2)
mkdirSync(path.join(out, 'png'), { recursive: true })
const manifest = {}
let n = 0
for (const arm of readdirSync(runs).sort()) {
  if (!statSync(path.join(runs, arm)).isDirectory()) continue
  for (const run of readdirSync(path.join(runs, arm)).sort()) {
    const d = path.join(runs, arm, run, 'png')
    if (!existsSync(d)) continue
    const cells = ((manifest[arm] ??= {})[run] ??= {})
    for (const f of readdirSync(d).sort()) {
      const h = createHash('sha1').update(readFileSync(path.join(d, f))).digest('hex')
      cells[f.slice(0, -4)] = h
      n++
      const dst = path.join(out, 'png', `${h}.png`)
      if (!existsSync(dst)) copyFileSync(path.join(d, f), dst)
    }
  }
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`${n} snapshots, ${readdirSync(path.join(out, 'png')).length} distinct`)
