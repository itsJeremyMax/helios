# Helios

[![ci](https://github.com/itsJeremyMax/helios/actions/workflows/ci.yml/badge.svg)](https://github.com/itsJeremyMax/helios/actions/workflows/ci.yml)
[![release](https://github.com/itsJeremyMax/helios/actions/workflows/release.yml/badge.svg)](https://github.com/itsJeremyMax/helios/actions/workflows/release.yml)

Helios is an enterprise-grade starter template for [Tauri 2](https://tauri.app)
desktop apps: React 19 + TypeScript on the front end, Rust on the back end, and
all the plumbing a real product needs already wired up — not just a hello-world
window.

## Features

- **Auto-update** — signed GitHub-releases updater with an in-app Settings UI
  (check-on-launch toggle, manual check, download/install/relaunch flow).
- **Release automation** — conventional commits drive
  [release-please](https://github.com/googleapis/release-please); merging its
  release PR builds and publishes signed installers for macOS (aarch64 +
  x86_64), Linux, and Windows in one pipeline.
- **Typed IPC** — Rust commands are the single source of truth;
  [tauri-specta](https://github.com/specta-rs/tauri-specta) generates
  `src/bindings.ts` so the frontend calls them with full type safety and no
  hand-written `invoke` strings.
- **Three-layer state model** — [TanStack Query](https://tanstack.com/query)
  for server/IPC state, [Zustand](https://zustand.docs.pmnd.rs) for client UI
  state, and `tauri-plugin-store` (via a Zustand storage adapter,
  `src/lib/storage.ts`) for anything that must survive a restart.
- **Crash handling** — a Rust panic hook writes backtraces to the log file, a
  React error boundary renders a recoverable crash screen instead of a blank
  window, and `attachConsole` forwards frontend console output into that same
  log.
- **Agent pack** — `CLAUDE.md` plus `.claude/skills/` and `.claude/rules/`
  encode the project's own conventions so an AI coding agent can extend it
  correctly on the first try.

## Quickstart

1. Click **Use this template** on GitHub (or `gh repo create --template
   itsJeremyMax/helios`) to create your own copy.
2. Run the stamp-out script to rename the app and its identifier:

   ```bash
   node scripts/setup.mjs --name my-app --display "My App"
   ```

3. Install platform prerequisites — see [CONTRIBUTING.md](./CONTRIBUTING.md)
   for the full list per OS (Xcode CLT on macOS; WebKitGTK + build tools on
   Linux; WebView2 + VS Build Tools on Windows).
4. Install dependencies and run the app:

   ```bash
   pnpm install
   pnpm tauri dev
   ```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server only (no Tauri window) |
| `pnpm tauri dev` | Full app in a native window with hot reload |
| `pnpm build` | Type-check and build the frontend bundle |
| `pnpm preview` | Serve the built frontend bundle for local preview |
| `pnpm tauri build` | Produce native installers for the current platform |
| `pnpm lint` / `pnpm lint:fix` | Biome lint (check / auto-fix) |
| `pnpm format` | Biome format, written in place |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest, single run / watch mode |
| `pnpm fmt:rust` | `cargo fmt` for `src-tauri` |
| `pnpm check:rust` | `cargo clippy --all-targets -- -D warnings` |
| `pnpm test:rust` | `cargo test` — also regenerates `src/bindings.ts` |
| `pnpm check:security` | `cargo-deny` (bans/licenses/sources) + `typos`, guarded — skips with a hint if the tools aren't installed (CI enforces them) |
| `pnpm check:all` | Everything CI runs: typecheck, lint, test, rustfmt check, clippy, cargo test, and `check:security` |

## Release flow

```
conventional commit → main
        |
        v
release-please opens/updates a release PR (bumps version, writes CHANGELOG.md)
        |  (merge that PR)
        v
release-please tags the commit and drafts a GitHub release
        |
        v
4-target matrix build (macOS aarch64, macOS x86_64, Linux x64, Windows) via tauri-action
        |  each target uploads signed installers + a partial latest.json
        v
draft release is flipped to published — latest.json goes live, the in-app updater picks it up
```

Versioning is entirely commit-message driven: `fix:` bumps patch, `feat:`
bumps minor, a `!` or `BREAKING CHANGE:` footer bumps major. `package.json` is
the single version source of truth; `release-please-config.json` mirrors it
into `src-tauri/Cargo.toml` on every release.

> **Linux update caveat:** the in-app updater can only self-update the
> `.AppImage` build. Users who installed via `.deb` or `.rpm` must update
> through their system package manager — the updater surfaces a hint to that
> effect instead of attempting an in-place replacement. macOS and Windows
> self-update normally.

## Secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Yes | Signs updater artifacts so the in-app updater trusts them |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Yes | Password for the signing key above |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | No | macOS code signing + notarization; when unset, macOS builds ship unsigned |

## Architecture map

```
src-tauri/src/lib.rs        plugin registration, panic hook, IPC command registry (single source of truth)
src-tauri/src/commands/     Tauri commands (app.rs, settings.rs) — each #[tauri::command] + #[specta::specta]
src-tauri/src/error.rs      AppError -> AppResult, serialized to the frontend as { kind, message }
src-tauri/capabilities/     least-privilege permission grants per window
src/bindings.ts             generated by tauri-specta (`pnpm test:rust`) — never hand-edit
src/lib/ipc/                single IPC entry point (queryKeys, unwrapResult) — call through this, not `invoke`
src/lib/storage.ts          Zustand <-> tauri-plugin-store persistence adapter
src/app/                    hash-based router, providers, root error boundary, app shell layout
src/features/<name>/        feature-foldered UI: home, settings, updater
src/shared/ui/              shadcn-derived primitives (Tailwind v4 + design tokens)
```

## For agent users

This repo ships an agent pack for Claude Code: `CLAUDE.md` describes the
stack, commands, and gotchas at a glance, and `.claude/skills/` encodes
step-by-step procedures (adding a command, adding a page, wiring a plugin,
auditing capabilities, debugging IPC, cutting a release). If you're an AI
agent working in this codebase, start there before making changes.

## Recipes

Short, self-contained guides for extending the template beyond its v1 desktop
scope live in [`docs/recipes/`](./docs/recipes):

- [Crash reporting with Sentry](./docs/recipes/sentry.md)
- [Internationalization (i18n)](./docs/recipes/i18n.md)
- [Deep links + autostart](./docs/recipes/deep-link-autostart.md)
- [End-to-end tests with WebDriver](./docs/recipes/e2e-webdriver.md)
- [Isolation pattern](./docs/recipes/isolation.md)
- [Mobile targets (iOS / Android)](./docs/recipes/mobile.md)

## License

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at
your option.
