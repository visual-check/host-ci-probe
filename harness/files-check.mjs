// Research: file handling per host OS, with no browser and no Docker. Prints one JSON report.
//   node files-check.mjs <index.json> <work dir>
// 1. Baseline file names from story IDs: case, Unicode normalization, reserved names, length, a deep directory.
// 2. A git round trip of those files, a PNG and LF text, with the runner's default git config, and with forced eol.
// 3. Changed files as git reports them: separators, renames, quoting of non-ASCII names.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [indexJson, workArg] = process.argv.slice(2)
const work = path.resolve(workArg)
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const report = { os: `${os.type()} ${os.release()} ${os.arch()}`, node: process.version, sep: path.sep }
const sha = (b) => createHash('sha1').update(b).digest('hex')
const run = (cmd, args, cwd) => {
  try { return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } }
  catch (e) { return { ok: false, out: String(e.stdout ?? ''), err: String(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' | ') } }
}
const gitcfg = (k, cwd) => run('git', ['config', '--show-origin', '--get', k], cwd).out.trim() || '(unset)'

// ---- environment ----
report.git = run('git', ['--version']).out.trim()
report.gitConfig = Object.fromEntries(['core.autocrlf', 'core.eol', 'core.longpaths', 'core.precomposeunicode', 'core.quotepath', 'core.symlinks'].map((k) => [k, gitcfg(k)]))
writeFileSync(path.join(work, 'case.txt'), 'x')
report.caseInsensitive = existsSync(path.join(work, 'CASE.TXT'))
const nfc = 'café.txt'
writeFileSync(path.join(work, nfc), 'x')
report.normalizationInsensitive = existsSync(path.join(work, nfc.normalize('NFD')))
report.readdirKeepsNfc = readdirSync(work).includes(nfc)

// ---- 1. baseline names ----
// Storybook 10's sanitize and toId, from storybookjs/storybook code/core/src/csf/csf-utils.ts (MIT)
const sanitize = (s) => s.toLowerCase().replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '')
const toId = (kind, name) => `${sanitize(kind)}--${sanitize(name)}`
const index = JSON.parse(readFileSync(indexJson, 'utf8'))
const storyIds = Object.values(index.entries).filter((e) => e.type === 'story').map((e) => e.id)
const synthetic = [
  ['Components/Button', 'Primary'],
  ['Components/BUTTON', 'PRIMARY'], // the same ID: IDs are lowercased
  ['Ünïcode/Ćwiczenie Łódź', 'Zażółć gęślą jaźń'],
  ['日本語/ボタン', '主要なボタン'],
  ['Emoji 🎉/Party', 'Confetti 🎊'],
  ['CON', 'AUX'], ['nul', 'com1'], ['LPT1', 'Prn'],
  ['Trailing dot.', 'name. '],
  ['Café'.normalize('NFC'), 'Story'], ['Café'.normalize('NFD'), 'Story'], // differ only in Unicode normalization
  [`Long/${'segment-'.repeat(14)}`, 'x'.repeat(100)], // about 230 ASCII characters
  [`長い/${'長'.repeat(60)}`, '名'.repeat(30)], // under 100 characters, over 255 bytes in UTF-8
].map(([k, n]) => ({ title: `${k} / ${n}`, id: toId(k, n) }))
const files = []
for (const id of [...storyIds, ...synthetic.map((s) => s.id)]) for (const suffix of ['', '.dark', '.webkit', '.dark.webkit']) files.push(`${id}${suffix}.png`)
const names = { stories: storyIds.length, synthetic, written: 0, errors: [], listed: 0, missingOnList: [], collisions: [] }
const dir = path.join(work, 'baselines')
mkdirSync(dir)
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a2dd4f8a0000000049454e44ae426082', 'hex')
const byPath = new Map()
for (const f of new Set(files)) {
  try {
    const p = path.join(dir, f)
    const key = report.caseInsensitive || report.normalizationInsensitive ? f.toLowerCase().normalize('NFC') : f
    if (byPath.has(key)) names.collisions.push([byPath.get(key), f])
    byPath.set(key, f)
    writeFileSync(p, Buffer.concat([png, Buffer.from(f)]))
    names.written++
  } catch (e) { names.errors.push(`${f.length} chars, ${Buffer.byteLength(f)} bytes: ${e.code}`) }
}
const listed = readdirSync(dir)
names.listed = listed.length
names.missingOnList = [...new Set(files)].filter((f) => !listed.includes(f)).slice(0, 10)
names.longestChars = Math.max(...listed.map((f) => f.length))
// a deep baselines directory, so the full path passes Windows' 260-character MAX_PATH
const deep = path.join(work, 'deep', ...Array.from({ length: 8 }, (_, i) => `packages-${i}-storybook-baselines`))
try { mkdirSync(deep, { recursive: true }); const p = path.join(deep, synthetic.at(-2).id + '.dark.webkit.png'); writeFileSync(p, png); names.deepPath = { chars: p.length, ok: readFileSync(p).equals(png) } }
catch (e) { names.deepPath = { error: e.code } }
report.names = names

// ---- 2. git round trip ----
const repo = path.join(work, 'repo')
mkdirSync(repo)
const git = (args, cwd = repo) => run('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.com', ...args], cwd)
git(['init', '-q', '-b', 'main'])
mkdirSync(path.join(repo, 'baselines'))
for (const f of listed) writeFileSync(path.join(repo, 'baselines', f), readFileSync(path.join(dir, f)))
mkdirSync(path.join(repo, 'deep', 'a'.repeat(100), 'b'.repeat(100)), { recursive: true })
writeFileSync(path.join(repo, 'deep', 'a'.repeat(100), 'b'.repeat(100), `${synthetic.at(-2).id}.png`), png)
writeFileSync(path.join(repo, 'visual-check.config.json'), '{\n  "browser": "chromium"\n}\n')
writeFileSync(path.join(repo, 'SKILL.md'), '---\nname: visual-check\n---\n\nLine one.\nLine two.\n')
const add = git(['add', '-A'])
const commit = git(['commit', '-q', '-m', 'baselines'])
const tracked = git(['ls-files', '-z']).out.split('\0').filter(Boolean)
const clone = (name, extra = []) => {
  const dst = path.join(work, name)
  const r = run('git', ['clone', '-q', ...extra, repo, dst])
  const out = { ok: r.ok, err: r.err, files: 0, missing: 0, changed: [] }
  for (const f of tracked) {
    const a = path.join(repo, f), b = path.join(dst, f)
    if (!existsSync(b)) { out.missing++; continue }
    out.files++
    if (sha(readFileSync(a)) !== sha(readFileSync(b))) out.changed.push(f.length > 60 ? `${f.slice(0, 60)}…` : f)
  }
  return out
}
report.git_roundtrip = { add: add.ok ? 'ok' : add.err, commit: commit.ok ? 'ok' : commit.err, tracked: tracked.length, defaultConfig: clone('clone-default'), longpaths: clone('clone-longpaths', ['-c', 'core.longpaths=true']) }
// .gitattributes that force eol conversion: text=auto keeps binary detection, a bare `text` doesn't
for (const [label, attr] of [['textAutoCrlf', '* text=auto eol=crlf\n'], ['forcedTextCrlf', '* text eol=crlf\n'], ['forcedTextPngBinary', '* text eol=crlf\n*.png binary\n']]) {
  const r2 = path.join(work, `attr-${label}`)
  mkdirSync(r2)
  git(['init', '-q', '-b', 'main'], r2)
  writeFileSync(path.join(r2, '.gitattributes'), attr)
  writeFileSync(path.join(r2, 'baseline.png'), png)
  writeFileSync(path.join(r2, 'a.json'), '{\n"a": 1\n}\n')
  git(['add', '-A'], r2)
  git(['commit', '-q', '-m', 'x'], r2)
  const dst = `${r2}-clone`
  run('git', ['clone', '-q', r2, dst])
  report[`attr_${label}`] = { pngIntact: existsSync(path.join(dst, 'baseline.png')) && readFileSync(path.join(dst, 'baseline.png')).equals(png), jsonHasCrlf: existsSync(path.join(dst, 'a.json')) && readFileSync(path.join(dst, 'a.json'), 'utf8').includes('\r\n') }
}
const cfgClone = path.join(work, 'clone-default', 'visual-check.config.json')
report.cloneDefault_jsonHasCrlf = existsSync(cfgClone) ? readFileSync(cfgClone, 'utf8').includes('\r\n') : 'not checked out'

// ---- 3. changed files ----
const src = path.join(repo, 'src', 'components', 'Button')
mkdirSync(src, { recursive: true })
writeFileSync(path.join(src, 'Button.tsx'), 'export const Button = () => null\n')
writeFileSync(path.join(src, 'Zażółć.stories.tsx'), 'export default {}\n')
git(['add', '-A'])
git(['commit', '-q', '-m', 'src'])
const base = git(['rev-parse', 'HEAD']).out.trim()
mkdirSync(path.join(repo, 'src', 'components', 'Btn'))
renameSync(path.join(src, 'Button.tsx'), path.join(repo, 'src', 'components', 'Btn', 'Button.tsx'))
writeFileSync(path.join(src, 'Zażółć.stories.tsx'), 'export default { title: "x" }\n')
writeFileSync(path.join(repo, 'src', 'untracked.ts'), '\n')
git(['add', '-A', 'src/components'])
report.changed = {
  nameStatus: git(['diff', '--name-status', '-M', base]).out.trim().split('\n'),
  nameStatusZ: git(['diff', '--name-status', '-M', '-z', base]).out.split('\0').filter(Boolean),
  untracked: git(['ls-files', '--others', '--exclude-standard']).out.trim().split('\n'),
  // what a Node path API gives for the same file, to compare with git's and index.json's './src/...'
  pathRelative: path.relative(repo, path.join(src, 'Zażółć.stories.tsx')),
}
console.log(JSON.stringify(report, null, 1))
