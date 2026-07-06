---
name: debugging-the-ipc-boundary
description: Diagnoses failures crossing the Rust↔frontend boundary — command not found, permission denied, promises that never resolve, panics, and missing events. Use when an invoke, tauri command, IPC call, or event misbehaves at runtime.
---

# Debugging the IPC boundary

Run the app with `pnpm tauri dev` (a plain browser has no Tauri runtime, so IPC
is inert there). For a Rust backtrace on panic: `RUST_BACKTRACE=1 pnpm tauri
dev`.

## Where to look

- **Frontend / webview**: right-click → Inspect in a dev build opens devtools.
  The log plugin also mirrors Rust logs into the webview console (its `Webview`
  target).
- **Rust logs on disk**: the log plugin writes `helios.log` to the OS app log
  dir — macOS `~/Library/Logs/com.jeremymax.helios/`, Linux
  `~/.local/share/com.jeremymax.helios/logs/`, Windows
  `%LOCALAPPDATA%\com.jeremymax.helios\logs\`. Rotation keeps all files.

## Symptom → cause

- **`command <x> not found`** → the command is missing from `collect_commands![]`
  in `lib.rs` (or the `#[specta::specta]` attribute is missing). See
  `/adding-a-tauri-command`.
- **`<x> not allowed`** → a PLUGIN call lacks a permission in
  `capabilities/default.json`. See `/configuring-capabilities-and-permissions`.
- **Promise never resolves / rejects with an odd shape** → the Rust command
  panicked (async commands swallow the unwind). The panic hook logs
  `panic: … <backtrace>` at `error` level to `helios.log` — check there. Fix by
  returning `AppResult` and converting `unwrap`/`expect` to `?`.
- **Error reaches JS but the UI mishandles it** → backend errors arrive as
  `{ kind, message }`. Unwrap fallible commands with `unwrapResult` and route
  unknown throws through `normalizeIpcError` (both in `@/lib/ipc`).
- **Event never received** → events must be collected with `collect_events!` and
  passed to the builder; `builder.mount_events(app)` is already called in
  `setup`. Confirm the frontend `listen`s on the exact event name the payload
  type generates.
- **Test passes but real app fails (or vice-versa)** → `mockIPC` uses the
  SNAKE_CASE command name and returns the raw payload; a camelCase name or a
  double-wrapped `{ status, data }` return silently no-ops the mock.
