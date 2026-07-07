# Helios

[![ci](https://github.com/itsJeremyMax/helios/actions/workflows/ci.yml/badge.svg)](https://github.com/itsJeremyMax/helios/actions/workflows/ci.yml)
[![release](https://github.com/itsJeremyMax/helios/actions/workflows/release.yml/badge.svg)](https://github.com/itsJeremyMax/helios/actions/workflows/release.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

**Helios is an enterprise-grade starter template for [Tauri 2](https://tauri.app)
desktop apps.** React 19 + TypeScript on the front end, Rust on the back end,
and all the plumbing a real product needs already wired up and tested, not a
hello-world window. Stamp out a new app with one command
([`scripts/setup.mjs`](./scripts/setup.mjs)), open it, and you have signed
auto-updates, a release pipeline, typed IPC, crash handling, a tray, and an
AI-agent playbook on day one. It doubles as a **reference** for both human
developers and AI coding agents: the conventions are encoded in
[`CLAUDE.md`](./CLAUDE.md), [`.claude/rules/`](./.claude/rules), and
[`.claude/skills/`](./.claude/skills) so features get built the same way every
time.

### Highlights

- **Signed auto-updates**: GitHub-Releases updater with an in-app Settings UI
  (check-on-launch toggle, manual check, download → install → relaunch).
- **Zero-touch release automation**: Conventional Commits drive
  [release-please](https://github.com/googleapis/release-please); merging its
  release PR builds and publishes signed installers for every platform.
- **Typed IPC boundary**: Rust commands are the single source of truth;
  [tauri-specta](https://github.com/specta-rs/tauri-specta) generates
  [`src/bindings.ts`](./src/bindings.ts) so the frontend calls them fully typed,
  with no hand-written `invoke` strings.
- **Three-layer state model**: TanStack Query for IPC data, Zustand for client
  UI state, and `tauri-plugin-store` for anything that must survive a restart.
- **Crash handling**: a Rust panic hook writes backtraces to the log, a React
  error boundary renders a recoverable crash screen, and `attachConsole`
  forwards frontend console output into that same log file.
- **System tray**: Show / Quit menu wired in Rust ([`tray.rs`](./src-tauri/src/tray.rs)).
- **Launch at startup**: OS login-item registration driven entirely from Rust,
  toggled from Settings, with the OS registration as the source of truth.
- **Theming**: system / light / dark, applied live with no restart, persisted
  across runs.
- **Single-instance + window-state**: a second launch focuses the running
  window; window geometry is saved and restored.
- **Agent pack**: `CLAUDE.md`, three rule files, and six step-by-step skills so
  an AI coding agent extends the codebase correctly on the first try.
- **All-OS builds**: Windows, Linux, and macOS (Apple Silicon **and** Intel)
  from one CI matrix.

---

## Tech stack

| Layer | Tooling | Version |
| --- | --- | --- |
| Desktop shell | [Tauri](https://tauri.app) | 2 |
| Frontend framework | [React](https://react.dev) | 19.2 |
| Language (frontend) | [TypeScript](https://www.typescriptlang.org) | ~6.0 |
| Bundler / dev server | [Vite](https://vite.dev) | 8 |
| Package manager | [pnpm](https://pnpm.io) | 11.10 (pinned via `packageManager`) |
| Styling | [Tailwind CSS](https://tailwindcss.com) | v4 (via `@tailwindcss/vite`) |
| UI primitives | [shadcn/ui](https://ui.shadcn.com) + [Radix](https://www.radix-ui.com) | `src/shared/ui/` |
| Routing | [React Router](https://reactrouter.com) (`createHashRouter`) | v8 |
| Server/IPC state | [TanStack Query](https://tanstack.com/query) | v5 |
| Client state | [Zustand](https://zustand.docs.pmnd.rs) | v5 |
| Typed IPC codegen | [tauri-specta](https://github.com/specta-rs/tauri-specta) + specta | 2.0.0-rc.25 |
| Lint + format | [Biome](https://biomejs.dev) | v2.5 |
| Frontend tests | [Vitest](https://vitest.dev) + Testing Library | v4 |
| Backend language | [Rust](https://www.rust-lang.org) | stable (pinned in `rust-toolchain.toml`) |

Fonts (Space Grotesk, Manrope, JetBrains Mono) are bundled locally via
`@fontsource-variable` and imported in [`src/main.tsx`](./src/main.tsx), never
CDN links, because the CSP is `font-src 'self'`.

---

## Prerequisites

Shared by every platform: **Node 22**, **pnpm 11** (run `corepack enable` to get
the pinned version), and a **stable Rust toolchain** via
[rustup](https://rustup.rs) (`rustfmt` + `clippy` are pinned in
[`rust-toolchain.toml`](./rust-toolchain.toml)).

| OS | Additional prerequisites |
| --- | --- |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** (Debian/Ubuntu) | `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` |
| **Windows** | [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on modern Windows) + Visual Studio Build Tools ("Desktop development with C++") |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the same list with commands.

---

## Quick start

### Use this template

1. Click **Use this template** on GitHub (or
   `gh repo create <you>/<app> --template itsJeremyMax/helios`) to create your
   own copy, then clone it.
2. **One command** turns the fresh clone into your app: it stamps out the
   identity, installs deps, and generates your own updater signing keypair
   (wiring the public key into `tauri.conf.json`):

   ```bash
   ./scripts/bootstrap.sh --name my-app --display "My App"
   ```

   `bootstrap.sh` walks you through everything: run it with no flags to be
   prompted interactively, or pass `--yes` (with `--name`) for a fully
   non-interactive run. Useful flags:

   | Flag | Purpose |
   | --- | --- |
   | `--name <kebab>` | App name, kebab-case (required unless prompted) |
   | `--display <name>` | Display / product name (default: Title Case of `--name`) |
   | `--identifier <id>` | Reverse-DNS bundle id (default: `com.jeremymax.<name>`) |
   | `--repo <owner/repo>` | GitHub slug (default: `itsJeremyMax/<name>`) |
   | `--author <name>` | Author / crate author (default: repo owner) |
   | `--fresh-git` | Wipe template history and start a fresh initial commit |
   | `--skip-install` / `--skip-keygen` | Skip those steps |
   | `--yes` | Non-interactive (requires `--name`; uses a random key password) |

   The bootstrap **refuses to run twice** (it aborts if `package.json`'s name is
   no longer `helios`). When it finishes, run the app:

   ```bash
   pnpm tauri dev
   ```

   > Use `pnpm tauri dev`, **not** `pnpm dev`. `pnpm dev` is a plain browser dev
   > server with no Tauri runtime, so IPC calls no-op there.

### À la carte: the individual steps

`bootstrap.sh` is a thin orchestrator over two reusable scripts you can also run
on their own.

**Stamp out the identity** ([`scripts/setup.mjs`](./scripts/setup.mjs))
rewrites the app name, display name, bundle identifier, repo slug, and Rust
crate name across the tree:

```bash
node scripts/setup.mjs --name my-app --display "My App"
```

| Flag | Required | Default |
| --- | --- | --- |
| `--name` | **yes** | None (must be kebab-case, e.g. `acme-notes`) |
| `--display` | no | Title Case of `--name` |
| `--identifier` | no | `com.jeremymax.<name>` (must be reverse-DNS) |
| `--repo` | no | `itsJeremyMax/<name>` (must be `owner/repo`) |
| `--author` | no | the repo owner |

It **refuses to run twice** and **warns** if `--repo` or `--identifier` fell
back to the template author's defaults. Re-run with explicit values before
shipping so you don't point releases or bundle IDs at someone else's namespace.

**Generate the updater signing key**
([`scripts/generate-signing-key.sh`](./scripts/generate-signing-key.sh)). The
template embeds the **original author's** updater public key. Before you cut a
release you need your own keypair, or your users can't verify your updates (and
you can't sign them). This script generates the key, wires its **public** half
into `tauri.conf.json → plugins.updater.pubkey`, and can push the private key +
password straight to GitHub Actions secrets:

```bash
# Generate + wire the pubkey (prompts for a password), and push CI secrets:
./scripts/generate-signing-key.sh --set-secrets

# Or non-interactively, with a strong random password saved beside the key:
./scripts/generate-signing-key.sh --name my-app --random --set-secrets
```

It **refuses to overwrite an existing key** without `--force`, because losing
the key that signed your shipped releases permanently breaks updates for
already-installed apps. The **same script rotates a key later**: re-run it with
`--force` (understand that all currently-installed apps trust only the old key
until they update once against a build signed by the previous key).

After either path, reinstall deps + regenerate lockfiles/bindings and, as the
owner, apply branch protection:

```bash
pnpm install && pnpm tauri dev   # run once to regenerate
gh api repos/<owner>/<repo>/rulesets -X POST --input .github/rulesets/main.json
```

[docs/RELEASE_VERIFICATION.md](./docs/RELEASE_VERIFICATION.md) is the full owner
checklist.

---

## Scripts

Every `package.json` script:

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server only (plain browser, **no** Tauri runtime) |
| `pnpm tauri dev` | Full app in a native window with hot reload (use this for IPC) |
| `pnpm build` | `tsc` type-check, then build the frontend bundle to `dist/` |
| `pnpm preview` | Serve the built frontend bundle for local preview |
| `pnpm tauri build` | Produce native installers for the current platform |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `biome check .` |
| `pnpm lint:fix` | `biome check --write .` (auto-fix) |
| `pnpm format` | `biome format --write .` |
| `pnpm fmt:rust` | `cargo fmt` for `src-tauri` |
| `pnpm check:rust` | `cargo clippy --all-targets -- -D warnings` |
| `pnpm test:rust` | `cargo test`, also **regenerates `src/bindings.ts`** |
| `pnpm check:security` | `cargo-deny` (bans/licenses/sources) + `typos`; guarded, so it skips with a hint if the tools aren't installed locally (CI always enforces them) |
| `pnpm check:all` | The full local gate mirroring CI: typecheck → lint → test → `cargo fmt --check` → clippy → cargo test → `check:security` |

> `pnpm test:rust` runs the `export_bindings` test, which rewrites
> [`src/bindings.ts`](./src/bindings.ts). CI fails if the regenerated file
> differs from what's committed, so run it after touching any command.

---

## Project structure

```
helios/
├─ src/                          # React frontend
│  ├─ main.tsx                   # entry: font imports, attachConsole, error listeners, root render
│  ├─ bindings.ts                # GENERATED typed IPC (tauri-specta), never hand-edit
│  ├─ app/                       # app-level wiring
│  │  ├─ router.tsx              # createHashRouter(routes)
│  │  ├─ routes.tsx              # route registry: the single integration point for pages
│  │  ├─ providers.tsx          # QueryClient, ThemeSync, LaunchUpdateCheck, Toaster
│  │  ├─ error-boundary.tsx     # RootErrorBoundary + RouteError crash UI
│  │  └─ layouts/app-shell.tsx  # sidebar nav (NAV_ITEMS) + version footer
│  ├─ features/                  # self-contained feature folders, each with a public index.ts
│  │  ├─ home/                   # sample page (greet command demo)
│  │  ├─ settings/               # theme, check-on-launch, launch-at-startup, reset; use-settings.ts hooks
│  │  └─ updater/               # useUpdater() + update card UI
│  ├─ lib/
│  │  ├─ ipc/index.ts           # THE IPC entry point: commands, queryKeys, unwrapResult, normalizeIpcError
│  │  ├─ storage.ts             # tauriStoreStorage: persistent Zustand adapter (never localStorage)
│  │  ├─ tauri.ts               # isTauri() runtime guard
│  │  └─ utils.ts               # cn() etc.
│  ├─ shared/ui/                 # shadcn/Radix primitives (Tailwind v4 + design tokens)
│  ├─ styles.css                 # @theme design tokens
│  └─ test/setup.ts              # Vitest setup
├─ src-tauri/                     # Rust backend
│  ├─ src/
│  │  ├─ lib.rs                  # plugin wiring, panic hook, specta_builder() command registry, tray/updater/autostart setup
│  │  ├─ main.rs                 # thin binary entry → helios_lib::run()
│  │  ├─ error.rs               # AppError / AppResult, serialized to { kind, message }
│  │  ├─ state.rs               # managed AppState (process uptime)
│  │  ├─ tray.rs                # system tray icon + menu
│  │  └─ commands/              # #[tauri::command] modules
│  │     ├─ app.rs              # greet, app_info (reads AppState uptime)
│  │     └─ settings.rs         # get/update/reset settings + versioned migration + autostart reconcile
│  ├─ capabilities/default.json  # least-privilege permission grants for the main window
│  ├─ tauri.conf.json           # CSP, updater config, bundle targets, window
│  └─ Cargo.toml                 # crate deps, release profile, clippy lints
├─ .claude/                       # AI-agent pack
│  ├─ rules/                     # capabilities.md, frontend.md, rust-backend.md
│  ├─ skills/                    # six SKILL.md procedures (see "Working with AI agents")
│  └─ settings.json             # format-on-save hook + permission allowlist
├─ docs/recipes/                  # opt-in extension guides (i18n, sentry, e2e, isolation, deep links, mobile)
├─ docs/RELEASE_VERIFICATION.md   # owner release checklist
├─ scripts/                       # new-app tooling
│  ├─ bootstrap.sh               # one-command new-app setup (stamp + install + keygen)
│  ├─ setup.mjs                  # template stamp-out (identity rewrite)
│  └─ generate-signing-key.sh    # generate/rotate the updater signing key
└─ CLAUDE.md                      # top-level agent brief
```

The architecture rests on three ideas: **feature folders** (each `src/features/<name>/`
is self-contained and only imported through its `index.ts`), a **typed IPC
boundary** (all Rust↔frontend calls flow through generated bindings behind
`@/lib/ipc`), and a **three-layer state model** (server/IPC data vs. ephemeral UI
vs. durable prefs). The next section unpacks each.

---

## Architecture deep-dive

### Typed IPC boundary

Rust commands are the single source of truth for the IPC surface.
[`specta_builder()`](./src-tauri/src/lib.rs) collects every command with
`collect_commands![]`; that one builder feeds **both** the runtime invoke
handler **and** the generated TypeScript in
[`src/bindings.ts`](./src/bindings.ts). A command is registered exactly once.

- **Command shape**: each fallible command is `#[tauri::command] #[specta::specta]`
  and returns `AppResult<T>`. See [`.claude/rules/rust-backend.md`](./.claude/rules/rust-backend.md).
- **Errors**: [`AppError`](./src-tauri/src/error.rs) serializes to a stable
  tagged shape `{ kind, message }`, so the frontend branches on `kind` without
  depending on Rust's enum layout. TS mirrors it as `IpcError`.
- **Frontend access**: components import `commands`, `queryKeys`,
  `unwrapResult`, and `normalizeIpcError` from
  [`@/lib/ipc`](./src/lib/ipc/index.ts), **never** `invoke` or `@/bindings`
  directly. Fallible commands return a tauri-specta `Result`; unwrap them with
  `unwrapResult(await commands.getSettings())`. Infallible commands (e.g.
  `commands.greet(name)`) return the value directly.
- **Adding a command**: command fn → `#[specta::specta]` →
  `collect_commands![]` → regenerate bindings (`pnpm test:rust`) → frontend
  Query hook → tests. The
  [`adding-a-tauri-command`](./.claude/skills/adding-a-tauri-command/SKILL.md)
  skill walks the whole path. A missing registration surfaces at runtime as
  "command not found".

Current commands: `greet`, `app_info` (version, platform, uptime from managed
state), `get_settings`, `update_settings`, `reset_app_data`.

### State model

Three layers, each with a designated tool
([`.claude/rules/frontend.md`](./.claude/rules/frontend.md)):

| State | Where it lives | Tool |
| --- | --- | --- |
| Backend/IPC data (settings, app info) | TanStack Query cache | `useQuery`/`useMutation` keyed by `queryKeys` |
| Ephemeral UI (open/closed, inputs) | Component / Zustand store | `useState` or a plain Zustand store |
| Durable client prefs | Tauri store file | Zustand `persist` + `tauriStoreStorage(file)` |

Persistent client state uses
[`tauriStoreStorage`](./src/lib/storage.ts) (a `tauri-plugin-store` adapter
with debounced saves), **never `localStorage`**, which doesn't survive a
packaged app. App settings themselves persist Rust-side to `settings.json` with
a **versioned, non-destructive migration**
([`commands/settings.rs`](./src-tauri/src/commands/settings.rs)): the schema
carries a `schemaVersion`, older payloads are salvaged field-by-field on read,
and data written by a *newer* build is never clobbered: patches merge onto the
raw object so unknown future fields survive the round-trip.

### Security

- **CSP** ([`tauri.conf.json`](./src-tauri/tauri.conf.json)) is deliberately
  tight: `default-src 'self'`, `script-src 'self'`, `font-src 'self'`,
  `connect-src` limited to `ipc:` / `http://ipc.localhost` (no external hosts).
  The updater talks to GitHub from the Rust side, so the WebView needs no
  network grant. See [`.claude/rules/capabilities.md`](./.claude/rules/capabilities.md).
- **Least-privilege capabilities** ([`capabilities/default.json`](./src-tauri/capabilities/default.json))
  grant only what a feature consumes. Our own `#[tauri::command]`s need no
  entry (they're gated by `collect_commands![]`); only plugin calls
  (`plugin:x|…`) need a permission. `tauri-plugin-fs` and `tauri-plugin-autostart`
  are Rust-side only and intentionally absent here.
- **Updater signing**: releases are signed with a minisign key; the app
  verifies every downloaded update against the embedded public key, independent
  of any OS code signing.

### Crash handling

Four nets catch failures at different layers:

- A **Rust panic hook** installed at the very top of `run()`
  ([`lib.rs`](./src-tauri/src/lib.rs)) captures a full backtrace to the log file
  for panics on any thread.
- A **React error boundary** ([`error-boundary.tsx`](./src/app/error-boundary.tsx))
  renders a calm, recoverable crash screen (reload / copy diagnostics / restart)
  instead of a blank window, at both the root and per-route level.
- **`attachConsole`** ([`main.tsx`](./src/main.tsx)) forwards frontend console
  output into the same log file, plus `window.onerror` / `unhandledrejection`
  listeners for errors that escape React.
- Logs rotate under the OS log dir (macOS: `~/Library/Logs/<identifier>/helios.log`).

---

## Building & releasing

Releases are **fully automated** and driven by commit messages. You never bump a
version, edit `CHANGELOG.md`, or tag by hand.

```
Conventional commit lands on main
        │
        ▼
release-please opens/updates a release PR (bumps package.json + Cargo.toml, writes CHANGELOG.md)
        │  (merge that PR)
        ▼
release-please tags the commit and drafts a GitHub release
        │
        ▼
build-tauri: 4-target matrix (macOS aarch64, macOS x86_64, Linux, Windows) via tauri-action
        │  each leg verifies package.json version == tag, then uploads signed installers + latest.json to the draft
        ▼
publish-release: flips the draft live atomically (gh release edit --draft=false --latest)
        │
        ▼
latest.json goes live → the in-app updater picks it up
```

Versioning is entirely commit-message driven: `fix:` bumps patch, `feat:` bumps
minor, `feat!:` or a `BREAKING CHANGE:` footer bumps major.
**`package.json` is the single version source of truth**;
[`release-please-config.json`](./release-please-config.json) mirrors it into
`src-tauri/Cargo.toml` on every release, and `tauri.conf.json` reads
`../package.json`. All-OS coverage is built in one pass: Windows, Linux, and
macOS for **both** Apple Silicon (`aarch64`) and Intel (`x86_64`).

The [`releasing-the-app`](./.claude/skills/releasing-the-app/SKILL.md) skill and
[docs/RELEASE_VERIFICATION.md](./docs/RELEASE_VERIFICATION.md) cover the
end-to-end owner checklist (billing, ruleset, first release, updater proof).

### Secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | **Yes** | Signs updater artifacts so the in-app updater trusts them |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **Yes** | Password for the signing key above |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | No | macOS code signing + notarization; when unset, macOS builds ship unsigned |

> **macOS unsigned caveat:** without the `APPLE_*` secrets the macOS build is not
> notarized, so the first manual install is Gatekeeper-blocked: **right-click →
> Open** once to run it. The updater is independent of Apple signing (it verifies
> against the embedded minisign key), so subsequent updates need no such dance.

> **Linux update caveat:** the in-app updater can only self-update the
> `.AppImage` build. Users who installed via `.deb` or `.rpm` must update through
> their system package manager. macOS and Windows self-update normally.

---

## Auto-updates

For the end user, updates are invisible-until-offered. On launch (when
**Settings → Check for updates on launch** is on), the app runs one silent check
against the release endpoint and, if a newer version exists, surfaces a
**toast** (not a modal) rather than interrupting startup. The manual flow lives
on the **Settings** page: **Check for updates** → if one is available,
**Download & install** streams progress, verifies the signature, and **relaunches**
into the new version. The check result is shared through one TanStack Query cache
key ([`useUpdater`](./src/features/updater/use-updater.ts)), so the launch check
and the Settings card never double-fetch.

---

## Working with AI agents

This repo ships a first-class pack for AI coding agents (Claude Code and
compatible tools). **Start with [`CLAUDE.md`](./CLAUDE.md)**: it summarizes the
stack, commands, hard rules, and architecture at a glance.

**Rules** ([`.claude/rules/`](./.claude/rules)), always-on conventions:

- [`capabilities.md`](./.claude/rules/capabilities.md): least-privilege
  permissions + CSP discipline.
- [`frontend.md`](./.claude/rules/frontend.md): three-layer state, IPC-only
  through `@/lib/ipc`, feature folders, styling with tokens.
- [`rust-backend.md`](./.claude/rules/rust-backend.md): command shape, no
  panics in commands, async rules, plugin init order.

**Skills** ([`.claude/skills/`](./.claude/skills)), step-by-step procedures:

- [`adding-a-page`](./.claude/skills/adding-a-page/SKILL.md): new feature folder
  + route + nav + test.
- [`adding-a-tauri-command`](./.claude/skills/adding-a-tauri-command/SKILL.md):
  a Rust command end-to-end (fn, registration, capability, bindings, hook, tests).
- [`adding-a-tauri-plugin`](./.claude/skills/adding-a-tauri-plugin/SKILL.md):
  install and wire a Tauri plugin (crate, JS package, init, permission, CSP).
- [`configuring-capabilities-and-permissions`](./.claude/skills/configuring-capabilities-and-permissions/SKILL.md):
  audit/adjust window permissions under least privilege.
- [`debugging-the-ipc-boundary`](./.claude/skills/debugging-the-ipc-boundary/SKILL.md):
  diagnose failed invokes, permission denials, hanging promises, panics,
  missing events.
- [`releasing-the-app`](./.claude/skills/releasing-the-app/SKILL.md): how the
  release pipeline works (read-only reference).

**Automation** ([`.claude/settings.json`](./.claude/settings.json)): a
`PostToolUse` hook auto-formats files on save (`cargo fmt` for `.rs`, Biome for
`.ts`/`.tsx`/`.json`/`.css`), and a permission allowlist pre-approves the safe
project commands. Before finishing any change, run the same gate CI runs:
`pnpm check:all`.

---

## Quality gates & CI

`pnpm check:all` mirrors CI locally. On every PR, four required checks run:

- **`ci`** ([ci.yml](./.github/workflows/ci.yml)): `pnpm typecheck`,
  `biome check`, Vitest, `cargo fmt --check`, `cargo clippy -D warnings`,
  `cargo test`, a **bindings-staleness gate** (`git diff --exit-code
  src/bindings.ts`), and [`typos`](https://github.com/crate-ci/typos).
- **`cargo-deny`** (same workflow): `check bans licenses sources` is enforcing;
  `check advisories` runs `continue-on-error`.
- **`codeql`** ([codeql.yml](./.github/workflows/codeql.yml)): CodeQL analysis
  for **both** `javascript-typescript` and `rust`, on PRs, pushes, and a weekly
  schedule.
- **`pr-title`** ([pr-title.yml](./.github/workflows/pr-title.yml)): enforces a
  Conventional-Commit PR title (the title becomes the squashed commit that feeds
  release-please).
- **`build-check-required`**: a 4-platform build matrix
  (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `ubuntu-22.04`,
  `windows-latest`) gated by a paths filter so doc-only PRs aren't blocked.

The branch ruleset ([`.github/rulesets/main.json`](./.github/rulesets/main.json))
enforces PR-only merges, linear history, and those required checks. Commits are
formatted on save and validated by a `lefthook` `commit-msg` hook plus the
`pr-title` check.

Dependencies stay current via
[Dependabot](https://docs.github.com/code-security/dependabot)
([`.github/dependabot.yml`](./.github/dependabot.yml)), which is native to GitHub
(no app to install). It opens weekly version-update PRs across three ecosystems
(Cargo in `src-tauri/`, npm/pnpm at the root, and GitHub Actions), grouping
minor and patch bumps per ecosystem into a single PR to cut noise while keeping
majors separate. Its commit messages are Conventional-Commit compatible
(`chore(deps): ...`), so they pass the `pr-title` and `commit-msg` gates. Enable
"Dependabot security updates" in repo settings to also get automatic
vulnerability-fix PRs.

---

## Recipes

Short, self-contained guides for extending the template beyond its v1 desktop
scope live in [`docs/recipes/`](./docs/recipes):

- [Internationalization (i18n)](./docs/recipes/i18n.md): shortest path to
  multi-language support with i18next + the OS locale.
- [Crash reporting with Sentry](./docs/recipes/sentry.md): layer Sentry on top
  of the built-in panic hook + error boundary.
- [End-to-end tests with WebDriver](./docs/recipes/e2e-webdriver.md): real E2E
  via WebdriverIO alongside the Vitest unit tests.
- [The isolation security pattern](./docs/recipes/isolation.md): enable Tauri's
  isolation IPC sandbox.
- [Deep links + launch-on-startup](./docs/recipes/deep-link-autostart.md):
  wire `myapp://` deep links (autostart is already built in).
- [Mobile targets (iOS / Android)](./docs/recipes/mobile.md): stand up the
  mobile projects; the scaffold is already `#[cfg(mobile)]`-ready.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for prerequisites, the pre-PR check
suite, Conventional Commit rules, and the list of never-hand-edit generated
files. In short: branch, make your change, run `pnpm check:all`, and open a PR
with a Conventional-Commit title.

## Security

Please report vulnerabilities per [SECURITY.md](./SECURITY.md). The app is
local-only by design (no remote capability grants), ships a tight CSP, and signs
its updates.

## License

Released under the [MIT License](./LICENSE-MIT). Apps you create from this
template are yours to license however you like.
</content>
</invoke>
