---
name: releasing-the-app
description: Explains how Helios ships — the release-please + tauri-action pipeline, how to verify a release, required secrets, recovering a failed matrix leg, and enabling OS code signing. Read-only reference; do not run releases on the model's own initiative.
disable-model-invocation: true
---

# Releasing the app

Releases are fully automated by `.github/workflows/release.yml`. You never build
or publish by hand. Version is owned by `package.json`; never hand-bump it.

## The pipeline

1. **Land Conventional Commits** on `main` (`feat:`, `fix:`, …). CI enforces the
   commit/PR title format.
2. **release-please** (`googleapis/release-please-action@v4`) opens/updates a
   "release PR" that accumulates the changelog and the next version. Config in
   `release-please-config.json` (release-type `node`, `draft: true`); it also
   mirrors the version into `src-tauri/Cargo.toml` via `extra-files`. The
   current version is tracked in `.release-please-manifest.json`.
3. **Merging the release PR** sets `release_created` and creates a DRAFT GitHub
   release with a lazily-created tag (the tag does not exist until publish).
4. **`build-tauri`** matrix builds installers on macOS (aarch64 + x86_64),
   `ubuntu-22.04`, and `windows-latest` with `tauri-apps/tauri-action@v0`
   (`releaseDraft: true`), signing the update artifacts and uploading them plus
   `latest.json` to the draft. It attaches by `tagName` + `releaseDraft: true`
   (finding release-please's existing draft by name) rather than by `releaseId`,
   because the tag is created lazily at publish time and a `releaseId` lookup
   raced with that — don't "fix" it back to `releaseId`. Each leg first asserts
   `package.json`'s version equals the tag (minus the leading `v`), failing fast
   on any mismatch.
5. **`publish-release`** runs `gh release edit <tag> --draft=false --latest`,
   flipping the release live and pointing the updater's `latest.json` endpoint
   at it atomically.

## Verifying a release

- GitHub **Actions** tab: all three jobs green.
- The **release page** has: per-OS installers, `latest.json`, and a `.sig` next
  to each updater artifact.
- The updater endpoint (`tauri.conf.json` → `plugins.updater.endpoints`,
  `…/releases/latest/download/latest.json`) resolves to the new version.

**Linux caveat:** the in-app updater can only self-update the `.AppImage`.
`.deb`/`.rpm` installs must be updated via the system package manager — the
updater UI shows a Linux hint saying so rather than attempting an in-place
swap. Verify self-update end-to-end on the `.AppImage` (and on macOS/Windows);
`.deb`/`.rpm` self-update is intentionally not supported.

## Secrets

| Secret | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | provided automatically; release-please + uploads + publish |
| `TAURI_SIGNING_PRIVATE_KEY` | signs updater artifacts (matches `pubkey` in `tauri.conf.json`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | password for that key |
| `APPLE_*` (optional) | macOS code signing / notarization — see below |

The two `TAURI_SIGNING_*` secrets and the embedded `pubkey` are generated and
wired together by `scripts/generate-signing-key.sh` (run at bootstrap, or on its
own with `--set-secrets` to push the secrets, or with `--force` to rotate the
key). Never hand-manage them; never reuse the template's key.

## When a matrix leg fails

The release stays a DRAFT (publish only runs after all `build-tauri` legs
succeed). Fix the cause, then **re-run the failed jobs** from the Actions tab —
successful legs keep their uploaded artifacts. No new tag or version bump is
needed. Only once every leg is green does `publish-release` flip it live.

## Enabling OS code signing later

The workflow is already wired for Apple signing — the `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID` env vars are passed to `tauri-action`. Empty
= unsigned build (current default). To enable, just add those repo secrets;
no workflow edit required. Windows signing would be a later addition.
