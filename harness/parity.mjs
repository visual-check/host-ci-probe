// Research: do snapshots taken from a Windows or macOS host match a Linux runner's? Compares each host arm's runs with
// the Linux runners' most common snapshot per cell for the same arm, and each Linux job with the other Linux jobs.
//   node parity.mjs --ref <dedupe dir>... --host <label>=<dedupe dir>... [--json out.json]
// A dedupe dir is dedupe.py's output: manifest.json {arm: {run: {cell: sha1}}} and png/<sha1>.png.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'

const { values: o } = parseArgs({ options: { ref: { type: 'string', multiple: true, default: [] }, host: { type: 'string', multiple: true, default: [] }, json: { type: 'string' } } })
const load = (dir) => ({ dir, m: JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) })
const file = (dir, h) => path.join(dir, 'png', `${h}.png`)
const decoded = new Map()
const decode = (f) => { if (!decoded.has(f)) { if (decoded.size > 300) decoded.clear(); decoded.set(f, PNG.sync.read(readFileSync(f))) } return decoded.get(f) }
const cache = new Map()
// differing pixels, and those whose largest channel delta is over 16 of 255 (content rather than raster)
function diff(a, b) {
  const k = a.h < b.h ? a.h + b.h : b.h + a.h
  if (cache.has(k)) return cache.get(k)
  const x = decode(a.f), y = decode(b.f)
  let px = 0, content = 0, max = 0
  if (x.width !== y.width || x.height !== y.height) { px = content = x.width * x.height; max = 255 }
  else for (let i = 0; i < x.data.length; i += 4) {
    const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]))
    if (d) { px++; if (d > max) max = d; if (d > 16) content++ }
  }
  const r = { px, content, max }
  cache.set(k, r)
  return r
}
function modal(sets, arm) {
  const counts = new Map()
  for (const { dir, m } of sets) for (const cells of Object.values(m[arm] ?? {})) for (const [cell, h] of Object.entries(cells)) {
    const c = counts.get(cell) ?? new Map(); counts.set(cell, c)
    const e = c.get(h) ?? { n: 0, f: file(dir, h), h }; e.n++; c.set(h, e)
  }
  return new Map([...counts].map(([cell, c]) => [cell, [...c.values()].sort((a, b) => b.n - a.n)[0]]))
}
// per run: identical cells, raster-only cells (no pixel over 16 of 255, or at most 20 such), content cells
function compare({ dir, m }, arm, ref) {
  const rows = []
  const cells = new Map()
  for (const [run, cs] of Object.entries(m[arm] ?? {})) {
    const r = { run, identical: 0, raster: 0, content: 0, missing: 0, maxRasterPx: 0, maxRasterDelta: 0 }
    for (const [cell, h] of Object.entries(cs)) {
      const want = ref.get(cell)
      if (!want) { r.missing++; continue }
      if (want.h === h) { r.identical++; continue }
      const d = diff({ h, f: file(dir, h) }, want)
      if (d.content > 20) { r.content++; cells.set(cell, (cells.get(cell) ?? 0) + 1) }
      else { r.raster++; r.maxRasterPx = Math.max(r.maxRasterPx, d.px); r.maxRasterDelta = Math.max(r.maxRasterDelta, d.max); cells.set(`${cell} (raster)`, (cells.get(`${cell} (raster)`) ?? 0) + 1) }
    }
    rows.push(r)
  }
  const mean = (k) => +(rows.reduce((s, r) => s + r[k], 0) / Math.max(1, rows.length)).toFixed(2)
  return { runs: rows.length, identical: mean('identical'), raster: mean('raster'), content: mean('content'), maxRasterPx: Math.max(0, ...rows.map((r) => r.maxRasterPx)), maxRasterDelta: Math.max(0, ...rows.map((r) => r.maxRasterDelta)), cells: Object.fromEntries([...cells].sort((a, b) => b[1] - a[1]).slice(0, 25)) }
}
const refs = o.ref.map(load)
const arms = [...new Set(refs.flatMap((r) => Object.keys(r.m)))].sort()
const out = { noiseFloor: {}, hosts: {} }
for (const arm of arms) {
  // each Linux job against the other Linux jobs
  out.noiseFloor[arm] = refs.map((r, i) => compare(r, arm, modal(refs.filter((_, j) => j !== i), arm)))
  const ref = modal(refs, arm)
  for (const h of o.host) {
    const [label, dir] = [h.slice(0, h.indexOf('=')), h.slice(h.indexOf('=') + 1)]
    const set = load(dir)
    for (const a of Object.keys(set.m).filter((a) => a === arm || a.startsWith(`${arm}~`)))
      (out.hosts[label] ??= {})[a] = compare(set, a, ref)
  }
}
for (const [arm, rows] of Object.entries(out.noiseFloor)) console.log(`linux ${arm}: ${rows.map((r) => `${r.identical}/${r.raster}/${r.content}`).join('  ')}  (identical/raster/content per run, each job vs the others)`)
for (const [label, arms] of Object.entries(out.hosts)) for (const [arm, r] of Object.entries(arms)) console.log(`${label} ${arm}: ${r.runs} runs, ${r.identical}/${r.raster}/${r.content}, raster up to ${r.maxRasterPx} px at ${r.maxRasterDelta}/255`)
if (o.json) writeFileSync(o.json, JSON.stringify(out, null, 1))
