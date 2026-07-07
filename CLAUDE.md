# Helios

Enterprise-grade Tauri 2 desktop starter: React 19 + Vite + TS frontend, Rust
backend, auto-updates via GitHub Releases, release-please pipeline.

## Commands

- `pnpm tauri dev` — run the desktop app. Use this (not `pnpm dev`) to exercise
  IPC; `pnpm dev` is a plain browser with no Tauri runtime.
- `pnpm check:all` — full quality gate: typecheck, biome lint, frontend tests,
  `cargo fmt --check`, clippy (`-D warnings`), `cargo test`, and
  `pnpm check:security`. Run before every commit; CI runs the same steps.
- `pnpm check:security` — `cargo-deny` (bans/licenses/sources) + `typos`,
  guarded so it skips with a hint when those tools aren't installed locally
  (CI always enforces them). Called by `check:all`.
- `pnpm test` / `pnpm test:rust` — frontend (vitest) / Rust (cargo test) tests.
  `pnpm test:rust` also regenerates `src/bindings.ts` (the `export_bindings`
  test). CI fails if the regenerated file differs from what's committed.
- `pnpm lint:fix` (biome `--write`), `pnpm fmt:rust` (cargo fmt) — auto-fix
  style. A PostToolUse hook already formats files as you save them.

## Architecture

- `src-tauri/src/lib.rs` — plugin wiring + `specta_builder()`. EVERY command is
  registered here in `collect_commands![]`; single-instance plugin goes first.
- `src-tauri/src/commands/<domain>.rs` — command modules (`app`, `settings`).
  `src-tauri/src/error.rs` — `AppError` (serializes to `{ kind, message }`) and
  `AppResult<T>`.
- `src-tauri/capabilities/default.json` — window permissions (least privilege).
  `src-tauri/tauri.conf.json` — CSP, updater config, bundle. Version field
  points at `../package.json`.
- `src/bindings.ts` — GENERATED typed IPC. Never edit by hand; regenerate via
  `pnpm test:rust`.
- `src/app/routes.tsx` — route registry (the single integration point for
  pages). `src/app/layouts/app-shell.tsx` — nav (`NAV_ITEMS`).
- `src/features/<name>/` — self-contained features with a public `index.ts`.
- `src/lib/ipc/index.ts` — `commands` re-export, `queryKeys`, `unwrapResult`,
  `normalizeIpcError`. `src/lib/storage.ts` — `tauriStoreStorage` (persistent
  Zustand adapter). `src/lib/tauri.ts` — `isTauri()` guard.
- `src/shared/ui/` — shadcn components. `src/styles.css` — `@theme` tokens.

## Hard rules

- Version lives ONLY in `package.json`. release-please bumps it and mirrors it
  into `Cargo.toml`; `tauri.conf.json` reads `../package.json`. Never hand-bump.
- Never import `invoke` directly — call `commands` from `@/lib/ipc`.
- A new command MUST be added to `collect_commands![]` in `lib.rs`, or it fails
  at runtime ("command not found") and never reaches the bindings. Our own
  `#[tauri::command]`s need no capability entry; only PLUGIN calls (`plugin:x|…`)
  need a permission in `capabilities/default.json`.
- Rust commands return `AppResult<T>`; never `unwrap`/`expect` or panic in a
  command (clippy warns on `unwrap_used`/`expect_used` outside setup/tests).
- Persistent client state → `tauriStoreStorage`, never `localStorage`.
- UI work → invoke the `frontend-design:frontend-design` skill. Fonts are
  bundled via `@fontsource-variable` (imported in `main.tsx`); never system
  stacks or CDN links (CSP `font-src 'self'`).
- Commits are Conventional Commits (enforced by lefthook `commit-msg` + the
  `pr-title` CI check).

## Implementation deviations from spec

Intentional, recorded departures from the original design spec
(`docs/superpowers/specs/2026-07-06-enterprise-tauri-starter-design.md`) — not
silent drift:

- **react-router resolved to v8** (spec said v7). v8 is v7's successor with a
  compatible data-mode API; `createHashRouter` and the centralized
  `src/app/routes.tsx` registry work unchanged. Recorded 2026-07-06.

## Skills

- `/adding-a-tauri-command` — add or change any Rust↔frontend call.
- `/adding-a-page` — new feature folder + route + nav + test.
- `/adding-a-tauri-plugin` — install and wire a Tauri plugin.
- `/configuring-capabilities-and-permissions` — audit/adjust window permissions.
- `/debugging-the-ipc-boundary` — diagnose failed invokes, events, panics.
- `/releasing-the-app` — how the release pipeline works (read-only reference).
