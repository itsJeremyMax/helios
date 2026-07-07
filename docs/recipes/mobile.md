# Recipe: enabling mobile targets (iOS / Android)

Helios is a **desktop-first** template — v1 ships and is tested only on macOS,
Linux, and Windows. But Tauri 2 is cross-platform, and the scaffold is already
mobile-ready: `src-tauri/src/lib.rs` carries the
`#[cfg_attr(mobile, tauri::mobile_entry_point)]` attribute on `run()`, and the
desktop-only pieces (the updater plugin, autostart) are already fenced behind
`#[cfg(desktop)]`. This recipe is the shortest path to standing up the mobile
projects when you need them.

## 1. Initialize the platform projects

```bash
pnpm tauri ios init      # generates src-tauri/gen/apple/  (needs Xcode)
pnpm tauri android init  # generates src-tauri/gen/android/ (needs Android Studio + NDK)
```

Each `init` scaffolds a native project under `src-tauri/gen/`. Commit those
directories — they hold per-platform config you will hand-edit (signing,
capabilities, icons).

## 2. Run and build

```bash
pnpm tauri ios dev       # boots the Simulator / a connected device
pnpm tauri android dev

pnpm tauri ios build
pnpm tauri android build
```

## 3. Identifier & signing notes

- The bundle **identifier** (`com.jeremymax.helios`, or whatever you stamped out
  with `scripts/setup.mjs`) is reused as the iOS bundle id and Android
  application id. Make sure it is a reverse-DNS namespace you actually own before
  submitting to a store.
- **iOS** signing needs an Apple Developer team; set it in Xcode on the
  generated project (`src-tauri/gen/apple/`) or via `--export-method` /
  provisioning flags on `tauri ios build`. This is separate from the desktop
  `APPLE_*` code-signing secrets in `release.yml`.
- **Android** release builds need a keystore; configure it in
  `src-tauri/gen/android/`. Do not commit the keystore or its passwords.

## 4. What does *not* carry over

- The **in-app updater** is `#[cfg(desktop)]`-only — mobile apps update through
  the App Store / Play Store, so there is no `latest.json` path on mobile.
- **Autostart** and **window-state** persistence are desktop concepts and are
  likewise fenced out.
- The `release.yml` matrix builds desktop installers only; mobile store
  pipelines (fastlane, Play Console upload) are out of scope for v1 and would be
  a separate workflow.

Mobile targets are **out of scope for the v1 desktop template** — nothing here
is wired into CI — but the Rust entry point and platform fences mean you can
opt in without restructuring the app.
