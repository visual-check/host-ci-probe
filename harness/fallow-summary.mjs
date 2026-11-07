// Research: what Fallow's DOT graph looks like on this OS: separators, line endings, and a hash of its sorted lines
// to compare graphs across runners.
//   node fallow-summary.mjs <fallow.dot>
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const dot = readFileSync(process.argv[2], 'utf8')
const lines = dot.split('\n')
const labels = [...dot.matchAll(/label="([^"]*)"/g)].map((m) => m[1])
console.log(JSON.stringify({
  lines: lines.length,
  crlf: dot.includes('\r\n'),
  backslashLabels: labels.filter((l) => l.includes('\\')).length,
  sample: labels.slice(0, 4),
  sortedSha: createHash('sha256').update(lines.map((l) => l.replace(/\r$/, '')).sort().join('\n')).digest('hex').slice(0, 16),
}))
