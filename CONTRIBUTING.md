# Contributing to Helios

## Prerequisites

Node 22, [pnpm](https://pnpm.io) (managed via `packageManager` in
`package.json`, use `corepack enable`), and a stable Rust toolchain (pinned in
`rust-toolchain.toml`, includes `rustfmt` + `clippy`). Then per OS:

- **macOS** — Xcode Command Line Tools: `xcode-select --install`.
- **Linux** — WebKitGTK and friends:

  ```bash
  sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

- **Windows** — [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  (preinstalled on modern Windows) and the Visual Studio Build Tools (Desktop
  development with C++ workload).

## Setup

```bash
pnpm install
pnpm tauri dev
```

## Before you open a PR

Run the full check suite locally — it's exactly what CI runs:

```bash
pnpm check:all
```

This runs, in order: `tsc --noEmit`, Biome lint, Vitest, `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, and `cargo test` (which also
regenerates `src/bindings.ts` — CI fails the build if that regeneration would
have produced a diff, so always run `pnpm test:rust` after touching any
`#[tauri::command]`).

### Optional local tools

CI runs [`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny) (license/
advisory/source checks) and [`typos`](https://github.com/crate-ci/typos) (spell
checking) via GitHub Actions, so neither is required to contribute. To run
them locally:

```bash
cargo install cargo-deny typos-cli --locked
```

This installs both binaries to `~/.cargo/bin` — make sure that directory is on
your `PATH`, then:

```bash
cd src-tauri && cargo deny check
typos
```

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org)
— `commitlint` enforces this via a `lefthook` `commit-msg` hook. The prefix
determines the next release version:

| Prefix | Effect |
| --- | --- |
| `fix: ...` | patch bump (0.1.0 → 0.1.1) |
| `feat: ...` | minor bump (0.1.0 → 0.2.0) |
| `feat!: ...` or a `BREAKING CHANGE:` footer | major bump (0.1.0 → 1.0.0) |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:` | no release, but still tracked in history |

Examples:

```
fix: prevent settings migration from clobbering a newer schema version
feat: add manual "check for updates" button to the settings page
feat!: rename the `greet` command to `say_hello`
```

## Pull requests

This repo squash-merges every PR, and **the PR title becomes the squashed
commit message** — so the PR title itself must be a valid Conventional
Commit (a `pr-title` workflow enforces this). The PR body can be free-form;
only the title drives the release.

## Release flow

Releases are fully automated — see the [README's release flow](./README.md#release-flow).
As a contributor you never bump the version, edit `CHANGELOG.md`, or tag a
release by hand; `release-please` does all of that from your commit history
once your PR lands on `main`.

## Never hand-edit

These files are generated or otherwise owned by tooling — edit the source
that produces them instead:

- `src/bindings.ts` — regenerate with `pnpm test:rust` after changing any
  Tauri command's signature or the commands registered in `specta_builder()`
  (`src-tauri/src/lib.rs`).
- `CHANGELOG.md` — written by `release-please` from commit history.
- The version in `package.json` / `src-tauri/Cargo.toml` — set by
  `release-please` based on Conventional Commit prefixes, never bumped
  manually.
- `pnpm-lock.yaml` — let `pnpm install` manage it; don't edit by hand.
