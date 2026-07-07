#!/usr/bin/env node
/**
 * Template stamp-out script.
 *
 * Rewrites every occurrence of the template's identity tokens across the repo
 * so a copy of this template becomes *your* app. Node-only, no dependencies.
 *
 * Usage:
 *   node scripts/setup.mjs --name acme-notes \
 *     [--display "Acme Notes"] \
 *     [--identifier com.example.acme-notes] \
 *     [--repo your-org/acme-notes] \
 *     [--author "Acme Inc"]
 *
 * Defaults: display is Title Case of --name, identifier is
 * com.jeremymax.<name>, repo is itsJeremyMax/<name>, author is the repo owner.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!flag.startsWith('--')) fail(`Unexpected argument: ${flag}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--'))
      fail(`Missing value for ${flag}`)
    args[flag.slice(2)] = value
    i++
  }
  return args
}

function fail(message) {
  console.error(`error: ${message}`)
  console.error(
    'usage: node scripts/setup.mjs --name <kebab-name> [--display <Display Name>] [--identifier <com.example.app>] [--repo <owner/repo>] [--author <Author Name>]',
  )
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const name = args.name
if (!name) fail('--name is required')
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name))
  fail(`--name must be kebab-case (got "${name}")`)

const snake = name.replaceAll('-', '_')
const display =
  args.display ??
  name
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
const identifier = args.identifier ?? `com.jeremymax.${name}`
if (!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(identifier))
  fail(`--identifier must be reverse-DNS (got "${identifier}")`)
const repo = args.repo ?? `itsJeremyMax/${name}`
if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
  fail(`--repo must be owner/repo (got "${repo}")`)
const author = args.author ?? repo.split('/')[0]
if (author.includes('"')) fail('--author must not contain double quotes')

// ------------------------------------------------------------------- guard
const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.name !== 'helios') {
  console.error(
    `error: package.json name is "${pkg.name}", not "helios" — this repo appears to be stamped out already. Refusing to run twice.`,
  )
  process.exit(1)
}

// ------------------------------------------------------------ replacements
// Ordered longest/most-specific first so narrower tokens don't clobber them.
const replacements = [
  ['itsJeremyMax/helios', repo],
  ['com.jeremymax.helios', identifier],
  ['helios_lib', `${snake}_lib`],
  ['Helios', display],
  ['helios', name],
]

// Never rewrite these: history, lockfiles (regenerated on install), generated
// bindings, internal planning docs, VCS internals, build output, and this
// script itself.
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.superpowers',
])
const EXCLUDED_PATHS = new Set([
  '.git', // a plain file (gitdir pointer) when running inside a git worktree
  'CHANGELOG.md',
  'pnpm-lock.yaml',
  'src-tauri/Cargo.lock',
  'src/bindings.ts',
  'scripts/setup.mjs',
  'docs/superpowers',
])

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    const rel = relative(ROOT, abs).replaceAll('\\', '/')
    if (EXCLUDED_PATHS.has(rel)) continue
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) yield* walk(abs)
    } else if (entry.isFile()) {
      yield { abs, rel }
    }
  }
}

let totalHits = 0
const changed = []
for (const { abs, rel } of walk(ROOT)) {
  const buf = readFileSync(abs)
  if (buf.includes(0)) continue // binary (icons, etc.)
  const before = buf.toString('utf8')
  let after = before
  let hits = 0
  for (const [token, value] of replacements) {
    const count = after.split(token).length - 1
    if (count > 0) {
      hits += count
      after = after.replaceAll(token, value)
    }
  }
  if (hits > 0) {
    writeFileSync(abs, after)
    changed.push([rel, hits])
    totalHits += hits
  }
}

// --------------------------------------------- Cargo.toml identity fields
// The crate description and authors carry no template token, so the generic
// walk above leaves them untouched. Rewrite them explicitly from the
// stamp-out identity so the packaged app's metadata matches the new app.
const cargoPath = join(ROOT, 'src-tauri', 'Cargo.toml')
const cargoBefore = readFileSync(cargoPath, 'utf8')
let cargoAfter = cargoBefore
let cargoHits = 0
for (const [pattern, value] of [
  [/^description = ".*"$/m, `description = "${display}"`],
  [/^authors = \[.*\]$/m, `authors = ["${author}"]`],
]) {
  const next = cargoAfter.replace(pattern, value)
  if (next !== cargoAfter) cargoHits++
  cargoAfter = next
}
if (cargoAfter !== cargoBefore) {
  writeFileSync(cargoPath, cargoAfter)
  totalHits += cargoHits
  const rel = relative(ROOT, cargoPath).replaceAll('\\', '/')
  // The generic walk may already have rewritten crate-name tokens in this
  // file; fold these identity-field replacements into that entry rather than
  // reporting a second row (or, worse, a bogus 0-hit row) for the same file.
  const existing = changed.find(([r]) => r === rel)
  if (existing) existing[1] += cargoHits
  else changed.push([rel, cargoHits])
}

// ----------------------------------------------------------------- summary
console.log(`Stamped out "${display}" (${name})`)
console.log(`  identifier : ${identifier}`)
console.log(`  crate lib  : ${snake}_lib`)
console.log(`  repository : ${repo}\n`)
console.log(
  `Rewrote ${totalHits} occurrence(s) across ${changed.length} file(s):`,
)
for (const [rel, hits] of changed)
  console.log(`  ${String(hits).padStart(3)}  ${rel}`)

console.log(`
Next steps:
  1. Generate your own updater signing keypair (NEVER reuse the template's):
       pnpm tauri signer generate -w ~/.tauri/${name}.key
  2. Store the key as GitHub Actions secrets:
       gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/${name}.key
       gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  3. Paste the new PUBLIC key into src-tauri/tauri.conf.json -> plugins.updater.pubkey
  4. Reinstall deps + regenerate lockfiles/bindings:
       pnpm install && pnpm tauri dev (once) or cargo check
  5. Review the changes and commit:
       git add -A && git commit -m "chore: stamp out template as ${name}"
  6. Apply branch protection to your new repo:
       gh api repos/${repo}/rulesets -X POST --input .github/rulesets/main.json
`)

const defaulted = []
if (!args.repo) defaulted.push(`--repo defaulted to "${repo}"`)
if (!args.identifier)
  defaulted.push(`--identifier defaulted to "${identifier}"`)
if (defaulted.length > 0) {
  console.log(`WARNING: ${defaulted.join('; ')}.`)
  console.log(
    '  These point at itsJeremyMax / com.jeremymax — if this is not your GitHub',
    'account or bundle-id namespace, re-clone the template and re-run with',
    'explicit --repo and --identifier before shipping.',
  )
}
