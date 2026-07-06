# Helios — Enterprise Tauri Starter: Design

**Date:** 2026-07-06
**Status:** Approved design, pending implementation plan
**Repo:** https://github.com/itsJeremyMax/helios (private, `main` branch)

## Goal

Turn the fresh `create-tauri-app` scaffold into an enterprise-grade Tauri 2 starter template that all future desktop apps stamp out of. Every cross-app concern — releases, auto-updates, CI, code quality, security, project structure, and AI-agent tooling — is built in, understood, and documented. App-specific concerns (i18n, crash reporting, e2e) are deliberately excluded but documented as recipes.

## Confirmed stack decisions

| Concern | Decision |
|---|---|
| Frontend | React 19 + Vite + TypeScript, pnpm |
| Routing | React Router v7, data mode, `createHashRouter` |
| Styling | Tailwind v4 + shadcn/ui (components vendored into repo) |
| UI process | All UI work via the `frontend-design:frontend-design` skill |
| Typography | Bundled Google Fonts via @fontsource (Space Grotesk / Manrope / JetBrains Mono); never system defaults or CDN |
| Data/state | TanStack Query (wraps all IPC) + Zustand (client state) |
| Lint/format (JS/TS) | Biome v2 (replaces ESLint + Prettier) |
| Rust quality | rustfmt.toml, Clippy via `Cargo.toml [lints]`, cargo-deny |
| Typed IPC | tauri-specta v2 (generated `src/bindings.ts`, pinned version) |
| Releases | release-please (node strategy) + tauri-action, single workflow |
| Updates | tauri-plugin-updater via GitHub Releases `latest.json` |
| Commits | Conventional Commits: lefthook + commitlint locally, PR-title lint in CI |
| OS code signing | Conditional CI scaffold; unsigned in v1 (updater signing always on) |
| Dependency updates | Renovate (grouped, npm+Cargo+Actions) + Dependabot security alerts |
| SAST | CodeQL (javascript-typescript + rust) |

## 1. Versioning & release pipeline

**Single source of truth: `package.json`.**

- `src-tauri/tauri.conf.json` sets `"version": "../package.json"` — never bumped again.
- release-please config: `release-type: node` at root; `extra-files` with a `toml` updater for `src-tauri/Cargo.toml` (`$.package.version`). `Cargo.lock` is NOT managed by release-please; the CI build regenerates it (`cargo build` rewrites the app's own entry). A CI step verifies the built app version matches the tag.
- `.release-please-manifest.json` starts at `0.1.0`.

**One `release.yml` workflow** (push to `main`):

1. `release-please-action@v4` job — maintains/updates the release PR; on release-PR merge, creates a **draft** GitHub release (draft configured in release-please config) and emits `release_created`, `tag_name`, `id` outputs.
2. `build-tauri` job — `needs` + `if: release_created`. Matrix: `macos-latest` (aarch64-apple-darwin), `macos-latest` (x86_64-apple-darwin), `ubuntu-22.04`, `windows-latest`. Steps: checkout, pnpm/action-setup, setup-node (pnpm cache), dtolnay/rust-toolchain@stable (+ mac targets), swatinem/rust-cache (`./src-tauri -> target`), Ubuntu apt deps (`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`), `pnpm install --frozen-lockfile`, `tauri-apps/tauri-action` with `releaseId` pointing at the release-please release (uploads bundles + updater artifacts + `latest.json` to it).
3. `publish-release` job — `needs: build-tauri`; publishes the draft via `gh api`. Publishing atomically flips `releases/latest/download/latest.json` live for updaters. If any matrix leg fails, the release stays draft — no partial release ever goes live.

Single-workflow design means the default `GITHUB_TOKEN` suffices (no PAT, no workflow-chaining trap).

## 2. Auto-updates

- Plugins: `tauri-plugin-updater` + `tauri-plugin-process` (desktop-only registration).
- `tauri.conf.json`: `bundle.createUpdaterArtifacts: true`; `plugins.updater` with embedded pubkey, endpoint `https://github.com/itsJeremyMax/helios/releases/latest/download/latest.json`, `windows.installMode: "passive"`.
- Signing keypair generated with `tauri signer generate`; private key + password stored as repo secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (set via `gh secret set`). **The user keeps an offline backup of the private key; losing it means installed apps can never update.**
- Capabilities: `updater:default`, `process:default`.
- Frontend: an `updater` feature — check on launch (configurable via settings store) + manual "Check for updates", download progress UI, restart prompt calling `relaunch()`. IPC via generated bindings; state via TanStack Query mutation.
- Linux caveat documented: only the AppImage self-updates; `.deb`/`.rpm` users update via package manager.

## 3. Commit discipline & repo hygiene

- **lefthook** (`pnpm-workspace.yaml` gets `onlyBuiltDependencies: [lefthook]`):
  - `commit-msg`: `commitlint --edit` (`@commitlint/config-conventional`).
  - `pre-commit` (parallel): Biome check `--write` on staged JS/TS/JSON (`stage_fixed`), `cargo fmt` on staged `.rs`.
- **CI enforcement:** `amannn/action-semantic-pull-request` lints the PR title — under squash-merge the title becomes the commit release-please reads, so this is the authoritative gate.
- **GitHub repo config (applied via `gh`):** squash-merge only (default commit message = PR title); ruleset on `main`: require PR, require status checks (ci, build-check when triggered, PR title), require linear history, block force pushes, repo-admin bypass for solo-maintainer pragmatism.
- **Meta files:** `.github/PULL_REQUEST_TEMPLATE.md` (conventional-title reminder + checklist), issue forms (`bug_report.yml`, `feature_request.yml`, `config.yml` with `blank_issues_enabled: false`), `SECURITY.md` (+ enable Private Vulnerability Reporting), `CONTRIBUTING.md` (setup, OS prerequisites, commit convention, release flow), `CODEOWNERS` (single owner now; structure for later), dual license `MIT OR Apache-2.0` (Rust/Tauri ecosystem norm: `LICENSE-MIT` + `LICENSE-APACHE`), rewritten `README.md`.
- **Template reuse:** repo marked as a GitHub template; `scripts/setup.mjs` renames a fresh copy in one command — takes new app name, rewrites `productName`, npm package name, identifier (`com.jeremymax.<name>`), Rust crate/lib name, window title, README heading — then reminds about generating a fresh updater keypair and secrets.

## 4. CI quality gates

- **`ci.yml`** (every PR + push to main; fast): Biome check, `tsc --noEmit`, Vitest, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, cargo-deny (advisories soft-fail via continue-on-error; bans/licenses/sources hard-fail), typos.
- **`build-check.yml`**: full `tauri build --ci` matrix (no release upload) on PRs touching `src-tauri/**`, `src/**`, config files, or workflows; also `workflow_dispatch`.
- **`codeql.yml`**: matrix `[javascript-typescript, rust]`, PR + weekly schedule.
- **Renovate** (`renovate.json`): grouped rules for cargo / npm / github-actions (with `pinDigests`), automerge minor/patch, lockfile maintenance, dependency dashboard. Dependabot security alerts stay on (no version PRs).
- **Local mirror:** `pnpm check:all` runs the exact CI gate (typecheck, lint, test, fmt-check, clippy, cargo test, deny, typos) so agents and humans verify before pushing.

## 5. Application structure

### Rust (`src-tauri/`)

```
src/
├── main.rs          # 3-line shim → helios_lib::run()
├── lib.rs           # builder: plugins (single-instance FIRST), specta builder,
│                    # managed state, tray, invoke_handler, setup
├── error.rs         # thiserror AppError, Serialize as tagged {kind, message};
│                    # pub type AppResult<T>
├── state.rs         # AppState (Mutex/RwLock; tokio Mutex if held across .await)
├── tray.rs          # system tray (core TrayIconBuilder) + menu
└── commands/
    ├── mod.rs
    ├── app.rs       # version/platform info, etc.
    └── settings.rs  # settings read/write via store
```

Rules encoded in the design: commands return `AppResult<T>`; never panic in a command; every command carries `#[tauri::command]` + `#[specta::specta]` and is registered in the specta builder (which generates the invoke handler); long-running work returns quickly and emits typed events.

### Typed IPC

tauri-specta v2 builder in `lib.rs`: `collect_commands!` + `collect_events!`, exporting `src/bindings.ts` on debug builds. Frontend imports `commands`/`events` from `bindings.ts` only — `invoke()` is never called directly. `bindings.ts` is committed (CI check that it's not stale). Pinned exact crate versions (specta v2 line is stable-in-practice but pre-1.0-labeled).

### Frontend (`src/`)

```
src/
├── app/             # providers.tsx (QueryClient, theme), router.tsx (createHashRouter),
│                    # routes.tsx, layouts/ (app shell w/ nav)
├── features/
│   ├── settings/    # settings page: theme toggle, launch-at-startup placeholder,
│   │                # update-check preference (store-backed, via Query)
│   ├── updater/     # update check/progress/restart UI
│   └── home/        # demo page: greet command round-trip, second page link
├── shared/          # ui/ (shadcn components), hooks/, utils/, types/
├── lib/
│   ├── ipc/         # thin re-exports/helpers over bindings.ts (query key factory,
│   │                # error normalization from tagged AppError)
│   └── store.ts     # tauri-plugin-store wrapper
├── bindings.ts      # GENERATED by tauri-specta
├── main.tsx
└── styles.css       # Tailwind v4 entry
```

Feature folders are self-contained with public `index.ts`; features never import each other (shared code moves to `shared/`). React Router v7 data mode with `createHashRouter` — hash history survives hard reloads under Tauri's custom protocol and works in the browser dev server; routes centralized in `src/app/routes.tsx`, demoing a nested layout + at least two pages.

**Modularity contract.** A feature is the unit of extension: adding one means creating `src/features/<name>/` (+ optionally `src-tauri/src/commands/<name>.rs`) and registering a route — nothing else in the app changes. Each feature owns its components, hooks, queries, and (if needed) Zustand slice behind its `index.ts`; route registration in `routes.tsx` is the single integration point. The `adding-a-page` and `adding-a-tauri-command` skills encode this contract so agents extend the system the same way humans do.

### UI design system & typography

- **All UI implementation goes through the `frontend-design:frontend-design` skill** — this is recorded in CLAUDE.md and the frontend rules file so agents (including future sessions) apply it to every UI task, and applies to the initial app-shell/pages build in this project.
- **No default/system font stacks.** Fonts are Google Fonts, **self-hosted via `@fontsource` packages** (bundled into the app — a desktop app must not fetch fonts from a CDN at runtime; this also keeps CSP closed and the app fully offline-capable). Default pairing: **Space Grotesk** (headings/display), **Manrope** (UI/body), **JetBrains Mono** (code/tabular data), wired as Tailwind v4 theme tokens. The frontend-design pass may refine the pairing, but the "bundled @fontsource, never system-default, never CDN" rule is fixed.
- Design tokens (font families, radii, spacing, semantic colors for light/dark) live in the Tailwind v4 `@theme` block in `styles.css` — one place to rebrand a stamped-out app; shadcn/ui components consume the same tokens.

### State & persistence model

Three explicitly delineated layers — the rules files teach agents which one to reach for:

1. **IPC/backend state → TanStack Query.** All data that lives in Rust (settings, app info, update status) flows through Query with a query-key factory in `lib/ipc`; mutations invalidate keys. No copying IPC results into stores.
2. **Client UI state → Zustand.** Ephemeral by default; slices that must survive restarts use Zustand's `persist` middleware backed by a custom storage adapter over `tauri-plugin-store` (debounced, atomic writes to the OS app-data dir — no localStorage, which webviews can evict).
3. **Durable app data → `tauri-plugin-store`** JSON files owned by Rust. The settings file carries a `schemaVersion` field and a migration hook runs on load, so stamped-out apps can evolve their settings shape safely. Window geometry stays with the window-state plugin.

### Crash handling & resilience (out of the box)

- **Frontend:** a top-level React error boundary (plus per-route boundaries via React Router's `errorElement`) renders a branded fallback with the error, a "copy diagnostics" button, and Restart/Reload actions (restart via the process plugin). Unhandled promise rejections and `window.onerror` are forwarded to the Rust log file via the log plugin bridge.
- **Rust:** a `std::panic::set_hook` in `run()` writes the panic + backtrace to the log file before default behavior; commands never panic (enforced by convention + review), so a panic is always a bug with a trace. Logs rotate (log plugin `RotationStrategy` + max file size).
- **Recovery:** persisted state writes are atomic and debounced, so a crash never corrupts settings; on next launch the app starts from last-good state. A "Reset app data" escape hatch lives in Settings.
- **Sentry (`sentry-tauri`) stays an opt-in recipe** (requires an account/DSN), but the wiring points (panic hook, error boundary, log bridge) are exactly where it plugs in, so enabling it later is a small, documented diff.

### Plugins baseline

single-instance (registered first), window-state, updater, process, opener, dialog, fs (tight scope), log (file in OS log dir + webview console bridge via `attachConsole`), store, os. System tray via core API. Theme: follow OS by default, user override persisted in store, synced to the webview.

### Security

- Real CSP replacing `csp: null`: `default-src 'self'`; `connect-src ipc: http://ipc.localhost https://github.com https://objects.githubusercontent.com` (updater); `img-src 'self' asset: http://asset.localhost blob: data:`; `style-src 'self' 'unsafe-inline'` (Tailwind inline styles); `script-src 'self'`.
- Capabilities: single `default.json` scoped to `main` window, least-privilege permission list; no `remote` grants. A comment header explains how to audit.
- No isolation pattern in v1 (first-party frontend only); documented as an upgrade.

## 6. Testing

- **Frontend:** Vitest + Testing Library + jsdom. `@tauri-apps/api/mocks` (`mockIPC`, `clearMocks` in `beforeEach`, `shouldMockEvents: true`) for boundary tests; module-level mocking of `lib/ipc` for component tests. Included: tests for the updater feature, settings feature, and one router-level page test.
- **Rust:** plain unit tests for logic; `tauri::test::mock_builder` (feature `test`) command-wiring tests with managed state, demonstrating `get_ipc_response`.
- **No WebDriver e2e in v1** (tauri-driver lacks direct macOS support). Documented recipe: WebdriverIO + `@wdio/tauri-service` when needed.

## 7. Agent pack

- **`CLAUDE.md`** (root, <200 lines): one-line description; stack + versions; exact commands (`pnpm dev`, `pnpm tauri dev`, `pnpm check:all`, `pnpm test`, `cargo test`, etc.); architecture map pointing at key files; top gotchas (register commands in the specta builder, new command needs a capability permission or it fails at runtime, bindings.ts is generated — never hand-edit, version lives only in package.json, lib.rs vs main.rs).
- **`.claude/rules/`** (path-scoped):
  - `rust-backend.md` (`paths: ["src-tauri/**/*.rs"]`) — AppResult pattern, no panics in commands, async by default, event emission for long ops.
  - `frontend.md` (`paths: ["src/**/*.{ts,tsx}"]`) — feature-folder rules, bindings-only IPC, the three-layer state model (Query / Zustand / store), shadcn + design-token conventions, and the mandate to use the `frontend-design:frontend-design` skill for UI work.
  - `capabilities.md` (`paths: ["src-tauri/capabilities/**", "src-tauri/tauri.conf.json"]`) — least privilege, CSP editing guidance.
- **`.claude/skills/`** (procedures):
  - `adding-a-tauri-command` — end-to-end checklist: Rust command → specta registration → capability permission → regenerate bindings → frontend hook via Query → Rust + frontend tests. Failure modes called out (missing registration, closed capability, stale bindings).
  - `adding-a-page` — React Router route + feature folder + nav entry + test.
  - `adding-a-tauri-plugin` — cargo add + JS package + `.plugin(init())` + capability perms + CSP implications.
  - `configuring-capabilities-and-permissions` — audit + minimal-grant workflow.
  - `debugging-the-ipc-boundary` — devtools, log plugin, permission-denied triage, event mismatches.
  - `releasing-the-app` (`disable-model-invocation: true`) — how the pipeline works, how to cut/verify a release, secrets involved.
- **`.claude/settings.json`** (checked in): permission allowlist (`Bash(pnpm *)`, `Bash(cargo build *)`, `Bash(cargo test *)`, `Bash(cargo clippy *)`, `Bash(cargo fmt *)` etc., deny `Bash(cargo publish *)`); PostToolUse hook auto-formatting edited files (Biome for TS/JSON, rustfmt for Rust).

## 8. Deliberately excluded from v1 (documented as recipes in `docs/recipes/`)

i18n (react-i18next), Sentry *remote* crash reporting (`sentry-tauri` — local crash handling is built in, see §5), WebDriver e2e, isolation pattern, mobile targets, deep-link + autostart plugins. Each recipe is a short doc so nothing is a dead end.

## 9. Bootstrap sequence (implementation-phase outline)

1. `git init -b main`, initial commit of current scaffold, add remote, push (baseline diffability).
2. Structure + tooling commits in Conventional Commit style (they seed the first changelog).
3. Generate updater keypair; `gh secret set` the two secrets; user stores offline backup.
4. Apply repo settings via `gh`: squash-merge only, ruleset, template flag, security features.
5. Verify end-to-end: `pnpm check:all` green, `pnpm tauri build` locally, then a `0.1.x` release dry-run through the real pipeline to prove release-please → build → publish → updater manifest works.

## Success criteria

- Merging a `feat:`/`fix:` PR produces a release PR; merging that produces a published GitHub release with installers for macOS/Windows/Linux and a working `latest.json`.
- An installed 0.1.0 app detects and installs 0.1.1 via the in-app updater.
- `pnpm check:all` and CI run the identical gate; a fresh clone needs only documented prerequisites + `pnpm install`.
- A new app can be stamped from the template with `scripts/setup.mjs` in under five minutes.
- Claude Code, opened cold in the repo, can add a new command end-to-end correctly using only the shipped CLAUDE.md/rules/skills.
