---
name: adding-a-tauri-command
description: Adds a Rust command end-to-end — command fn, specta registration, capability check, regenerated bindings, frontend Query hook, and tests. Use when adding or changing any Rust↔frontend IPC call, tauri command, or invoke.
---

# Adding a Tauri command

A command only becomes real when it is registered in the specta builder AND its
regenerated bindings are committed. Follow every step; the failure modes below
are what happens when one is skipped.

## Checklist

1. **Write the command** in `src-tauri/src/commands/<domain>.rs`. Return
   `AppResult<T>` for anything fallible, and add both attributes:

   ```rust
   #[tauri::command]
   #[specta::specta]
   pub fn system_stats(app: tauri::AppHandle) -> AppResult<SystemStats> {
       Ok(SystemStats { /* … */ })
   }
   ```

   Payload structs derive `serde::Serialize` + `specta::Type` with
   `#[serde(rename_all = "camelCase")]` (see `commands::app::AppInfo`). New
   module? add `pub mod <domain>;` to `commands/mod.rs`.

2. **Register it** in `collect_commands![]` inside `specta_builder()` in
   `src-tauri/src/lib.rs`:

   ```rust
   commands::app::system_stats,
   ```

3. **Unit-test the pure logic** in a `#[cfg(test)]` module (keep computation out
   of the `#[tauri::command]` wrapper so it is testable without a running app —
   see `settings::migrate`).

4. **Regenerate bindings**: `pnpm test:rust`. This runs the `export_bindings`
   test which rewrites `src/bindings.ts`. Commit the diff; never edit it by hand.

5. **Capabilities check**: a plain `#[tauri::command]` of ours needs NO entry in
   `capabilities/default.json` — it is gated only by the registration in step 2.
   You only add a permission if your command's IMPLEMENTATION calls a plugin
   that itself requires one (most core plugins we use are already granted).

6. **Add a Query hook** in the owning feature (`src/features/<name>/`), calling
   through `@/lib/ipc` with a stable key from `queryKeys`:

   ```ts
   import { commands, queryKeys, unwrapResult } from '@/lib/ipc'
   export function useSystemStats() {
     return useQuery({
       queryKey: queryKeys.systemStats,
       queryFn: async () => unwrapResult(await commands.systemStats()),
     })
   }
   ```

   Add the key to `queryKeys` in `src/lib/ipc/index.ts`. Infallible commands
   (like `greet`) return the value directly — skip `unwrapResult`.

7. **Component/hook test** with `mockIPC`, using the SNAKE_CASE command name and
   returning the PLAIN payload (tauri-specta wraps it into `{ status, data }`):

   ```ts
   mockIPC((cmd) => {
     if (cmd === 'system_stats') return { uptimeSecs: 42 }
   })
   ```

8. **Gate**: `pnpm check:all` (typecheck, lint, tests, fmt, clippy, rust tests).

## Failure modes

- Forgot step 2 → runtime `"command <name> not found"`; the binding may not even
  exist.
- Skipped step 4, or edited `bindings.ts` by hand → CI `git diff --exit-code
  src/bindings.ts` fails ("bindings must not be stale").
- Used `getSettings` (camelCase) in `mockIPC` → the mock never matches; invoke
  uses the snake_case name. TS call sites use camelCase; mocks use snake_case.
- Wrapped the mock return in `{ status: 'ok', data }` → double-wrapped; return
  the raw payload.
