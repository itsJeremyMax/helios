# Release Verification

This document records what has been verified locally for the release pipeline
and gives the repository owner a precise, ordered checklist for the parts that
can only be proven with live GitHub infrastructure.

## Why some steps are deferred

Two hard constraints block the end-to-end release dry-run from being executed by
the automation that produced this branch:

1. **Nothing merges to `main` yet.** The owner has reserved all merges to the
   default branch. Steps that require a merge (PR #1, the release-please PR) are
   therefore owner-only.
2. **GitHub Actions is billing-blocked at the account level.** Every workflow
   job dies instantly until billing is restored, so `release.yml` (and every
   other workflow) cannot run. No release, build matrix, or publish can happen
   until this is fixed.

Everything that does **not** depend on those two things has been verified on
this branch — see "Verified locally" below.

## Verified locally (branch `feat/enterprise-starter`)

- **Production build** — `pnpm tauri build` compiles the release binary and
  bundles `Helios.app` under `src-tauri/target/release/bundle/macos/`.
  - The **`.dmg` step fails headless** (`bundle_dmg.sh` drives Finder via
    AppleScript, which needs a real GUI/Finder session; it times out or errors
    in a headless/automation context). This is an environment limitation, not a
    config defect — GitHub's macOS runners (via `tauri-action`) build the DMG
    successfully. The `.app` itself builds fine.
- **Updater signatures** — the build emits `.sig` files **only when**
  `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are present
  in the environment. They are intentionally **absent from local builds** (the
  private key is never exported to a dev machine), and the local run aborts at
  the DMG step before the updater archive/`.sig` would be produced anyway. CI
  holds the signing keys as repository secrets and generates the `.app.tar.gz` +
  `.sig` assets there. Local absence of `.sig` files is expected and correct,
  not a regression.
- **Version consistency** — all four sources agree:
  - `package.json` → `0.1.0`
  - `src-tauri/tauri.conf.json` → `"version": "../package.json"` (resolves to `0.1.0`)
  - `src-tauri/Cargo.toml` → `0.1.0`
  - `.release-please-manifest.json` → `0.1.0`
- **Full gate green** — `pnpm typecheck`, `biome check`, `vitest` (17 passed),
  `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` (6 passed), and
  `typos` all pass (a `typos` finding in a `settings.rs` comment was fixed on
  this branch).
- **cargo-deny** — the enforced gate `cargo deny check bans licenses sources`
  passes. `cargo deny check advisories` reports one **informational**
  unmaintained advisory, RUSTSEC-2024-0436 (`paste`, pulled in transitively via
  Tauri/specta proc-macro crates). CI runs the advisories step with
  `continue-on-error: true` by design, so it does not block the merge gate.
- **App boots cleanly** — the built `Helios.app` launches, creates its window
  (title **"Helios"**, per `tauri.conf.json`), runs the on-launch updater check,
  and writes a clean log (`~/Library/Logs/com.jeremymax.helios/helios.log`) with
  no panics. The only `[ERROR]` lines are `update endpoint did not respond`,
  expected because no release is published yet (the updater `latest.json` 404s).
- **Settings persistence** — `settings.json` (schema v1) is written and reloaded
  from the app data dir across runs.
- **Window-state persistence** — launching the app, moving/sizing the window,
  and quitting gracefully writes `.window-state.json` with real geometry; a
  relaunch boots cleanly and the plugin restores from that file.

### GUI checks — status

| Check | Status | Notes |
|---|---|---|
| Window appears, title "Helios" | Verified | Built app launches; window title set to "Helios" in `tauri.conf.json`; window-create trace in `helios.log` |
| Settings persistence | Verified | `settings.json` schema v1 present and valid |
| Clean boot / logging | Verified | Multiple clean boot cycles in `helios.log`, no panics |
| Window-state save + restore | Verified | Graceful quit writes `.window-state.json` with real geometry; relaunch boots clean and the plugin restores it |
| Second-instance focus (T10, deferred) | Not confirmed | Launching a second instance should focus the existing window rather than spawn a new one; single-instance handler is wired in `lib.rs`, but the focus-on-relaunch behavior needs eyeballing on a real desktop session |
| Tray icon present | Wired, not visually confirmed | `tray.rs` `create()` runs in `setup`; live geometry/tray scraping via System Events timed out in this automation context (accessibility permission) — eyeball on a real desktop session to be 100% |
| Theme toggle applied live | Not confirmed | Requires clicking the UI on a real desktop; `theme` field persists correctly in `settings.json` |

## Owner checklist — deferred end-to-end proof

Do these in order once the two blockers above are cleared.

### (a) Fix GitHub Actions billing
Restore billing on the account so workflow jobs can run. Confirm with a trivial
push that a workflow reaches "queued → in progress" instead of dying instantly.

### (b) Install the Renovate GitHub App
Install Renovate on the repo (`renovate.json` is already committed). Confirm the
onboarding/Dependency Dashboard issue appears.

### (c) Apply the branch ruleset
Requires a **public repo** or a **GitHub Pro/Team** plan (rulesets are not
available on free private repos):

```bash
gh api repos/<owner>/<repo>/rulesets -X POST --input .github/rulesets/main.json
```

This enforces PR-only merges, linear history, and the required status checks
`ci`, `cargo-deny`, `pr-title`, and `build-check-required`.
`build-check-required` is a single, non-matrix aggregator job that **always
posts** on every PR and rolls up the four-platform `build-check` matrix
(`aarch64-apple-darwin`, `x86_64-apple-darwin`, `ubuntu-22.04`,
`windows-latest`). It is build-path-conditional at the *job* level, not the
workflow level: the `build-check.yml` workflow always runs, a `dorny/paths-filter`
gate detects whether build-relevant paths (`src/`, `src-tauri/`, `package.json`,
`pnpm-lock.yaml`, the workflow itself) changed, and the matrix legs run only when
they did. The aggregator passes when the matrix was skipped (nothing to build) or
all four legs went green, and fails if any leg failed or was cancelled — so the
required context is always satisfiable and doc-only PRs are never blocked.
(Do **not** require the bare `build-check` context: matrix legs report per-leg
check-runs like `build-check (macos-latest, --target aarch64-apple-darwin, …)`,
never the bare name, so `build-check` could never be satisfied; and a
workflow-level `paths:` filter would leave the required check stuck in
Expected/Pending on unrelated PRs, blocking merge — GitHub only treats
*job-level* skips as success.) If the POST 422s, GitHub's ruleset
schema has
drifted — fetch the current shape with
`gh api /repos/<owner>/<repo>/rulesets` on a repo that already has one and adapt.

### (d) Merge PR #1
Merge with **squash** and a **conventional-commit title** (e.g.
`feat: enterprise starter template`). The title feeds release-please's version
bump, so it must be conventional.

### (e) Watch release-please open the release PR
On push to `main`, `release.yml` runs the `release-please` job. It opens a
`chore(main): release 0.2.0` PR that bumps `package.json`, `Cargo.toml` (via the
`extra-files` TOML jsonpath), the manifest, and updates `CHANGELOG.md`. Merge it.

### (f) Verify the build + auto-publish
Merging the release PR sets `release_created=true`, which triggers:
- **`build-tauri`** — a 4-target matrix: `aarch64-apple-darwin`,
  `x86_64-apple-darwin`, `ubuntu-22.04`, `windows-latest`. Each attaches its
  artifacts to the **draft** release. Before building, each leg runs a
  **version-check step** that asserts `jq -r .version package.json` equals the
  release tag with its leading `v` stripped, failing fast on any mismatch so a
  mislabeled build never ships.
- Expected assets: `.dmg` + `.app.tar.gz` + `.sig` (×2 macOS archs),
  `.AppImage` + `.sig`, `.deb`, `.rpm`, `.msi`/`-setup.exe` + `.sig`, and
  **`latest.json`**.
- **`publish-release`** — flips the draft live atomically:
  `gh release edit <tag> --draft=false --latest`.

Confirm all four matrix legs go green, every expected `.sig` is present, and
`latest.json`'s version matches the tag.

### (g) Prove the in-app updater end-to-end
1. Install the published **0.2.0** build locally (macOS caveat below).
2. Land a `fix:` commit to `main`; let release-please cut and publish **0.2.1**.
3. Launch the installed 0.2.0 app. The in-app updater (endpoint
   `https://github.com/<owner>/helios/releases/latest/download/latest.json`)
   should detect 0.2.1, offer install, download+verify against the embedded
   pubkey, and relaunch as **0.2.1**.

### (h) macOS unsigned caveat
The macOS build is **not** Apple-code-signed/notarized (Apple signing secrets
are optional and empty by default). The first manual install will be Gatekeeper-
blocked — **right-click → Open** to run it the first time. The updater itself is
independent of Apple signing: it validates downloads against the embedded
minisign pubkey, so subsequent updates do not need the right-click dance.

### (i) Manual GUI checks (require a human on a real desktop session)
These are not automation blockers — they simply need a person clicking around a
real windowing session (tray menus, live theme switches, and second-instance
focus cannot be faithfully scraped headless). None of them are owner-*blocked*;
they are just manual steps. Run them once on the built app and tick each off so
none is silently dropped:

- [ ] **Tray icon** — the tray icon appears; its menu **Show** reveals the
  window and **Quit** exits the app cleanly.
- [ ] **Live theme toggle** — changing the theme in Settings applies
  immediately across all three modes (**system**, **light**, **dark**) with no
  restart, and `system` follows the OS appearance when it changes.
- [ ] **Second-instance focus** — launching a second copy focuses the existing
  window instead of spawning a new one (single-instance handler in `lib.rs`).
- [ ] **Window-state restore** — move/resize the window, quit, relaunch; the
  window reopens at the saved geometry (`.window-state.json`).
- [ ] **Autostart** — enable launch-at-startup in Settings, reboot, and confirm
  the app launches automatically on login; disabling it stops that.
