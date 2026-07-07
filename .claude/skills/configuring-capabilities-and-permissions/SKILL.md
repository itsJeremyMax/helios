---
name: configuring-capabilities-and-permissions
description: Audits and adjusts window permissions in capabilities/default.json under least privilege. Use when a plugin call is denied at runtime, when adding or removing a permission, or when reviewing what the app is allowed to do.
---

# Configuring capabilities & permissions

`src-tauri/capabilities/default.json` is the allowlist of PLUGIN commands the
`main` window may call. Our own `#[tauri::command]`s are NOT gated here — they
are gated by `collect_commands![]` in `lib.rs`.

## Audit procedure

1. **List** the current `permissions` array. Each entry is either `core:default`
   or a `<plugin>:<perm>` identifier.
2. **Map** each permission to the feature that consumes it (e.g. `store:default`
   ← settings persistence; `updater:default` ← the updater feature;
   `process:default` ← relaunch-after-update). The file's `description` field is
   the standing reminder to keep this mapping true.
3. **Remove orphans**: if a feature was deleted, delete its permission. Unused
   grants are attack surface.

## Adding a permission (least privilege)

- Add the NARROWEST identifier that works. For `fs`/`shell`, prefer a specific
  `allow-*` (e.g. `fs:allow-app-read`) over the broad `:default` bundle.
- Find valid identifiers in the plugin's docs or in the generated
  `src-tauri/gen/schemas/desktop-schema.json` (the `$schema` the file points
  at). Regenerate it with `pnpm tauri dev` after adding a plugin.
- NEVER widen `windows` beyond what a feature needs, and NEVER add
  `remote`/`remoteDomains` — this app is local-only.

## Diagnosing errors

- Runtime `"<cmd> not allowed"` → the plugin permission is MISSING here. Add it,
  regenerate schemas, retry.
- Runtime `"command <cmd> not found"` → NOT a capability problem; the command is
  missing from `collect_commands![]` in `lib.rs`.

CSP lives separately in `tauri.conf.json` (`app.security.csp`); see the
`capabilities.md` rule before loosening it.
