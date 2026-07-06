---
paths: ["src-tauri/**/*.rs"]
---

# Rust backend conventions

## Command shape

Every fallible command returns `AppResult<T>` (from `crate::error`) and carries
BOTH attributes plus a registration:

```rust
#[tauri::command]
#[specta::specta]
pub fn do_thing(app: tauri::AppHandle) -> AppResult<Thing> {
    let store = app.store(FILE).map_err(|e| AppError::Store(e.to_string()))?;
    Ok(Thing { /* … */ })
}
```

Then add it to `collect_commands![]` in `lib.rs`. Missing `#[specta::specta]` or
the registration means the command is invisible to the bindings and fails at
runtime. Infallible commands may return a plain value (e.g. `greet -> String`),
but prefer `AppResult<T>` for anything that can fail.

`AppError` serializes to `{ kind, message }`; add a new variant + `kind()` arm
rather than stringly-typing errors into `Other`.

## No panics in commands

`unwrap_used` and `expect_used` are clippy warnings (see `[lints.clippy]` in
`Cargo.toml`) and CI runs clippy with `-D warnings`. Convert with `?` and
`map_err`. The only sanctioned panics are setup-time in `lib.rs`/`tray.rs`,
gated behind `#[allow(clippy::expect_used)]` with a justifying comment, and in
`#[cfg(test)]` modules. Keep migration/parse logic in pure functions (see
`settings::migrate`) so it is unit-testable without a running app.

## Async and long-running work

Commands may be `async fn`. If you hold state across an `.await`, use
`tokio::sync::Mutex`, never `std::sync::Mutex`. For long operations, return
quickly and stream progress with a specta event: define events with
`tauri_specta::collect_events!` and pass them to the builder's `.events(…)` —
`builder.mount_events(app)` is already called in `setup`. The updater's
download progress is the reference pattern (frontend side in
`features/updater/use-updater.ts`).

## Plugin init order

Plugins are registered in `lib.rs`. `tauri_plugin_single_instance` MUST be
first so a second launch is forwarded to the running window before any other
plugin initializes. The updater plugin is added in `setup` under
`#[cfg(desktop)]` (mobile has no in-app update path). A panic hook is installed
at the very top of `run()` so panics on any thread reach the log file.
