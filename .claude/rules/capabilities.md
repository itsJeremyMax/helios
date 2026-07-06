---
paths: ["src-tauri/capabilities/**", "src-tauri/tauri.conf.json"]
---

# Capabilities & CSP conventions

`capabilities/default.json` grants permissions to the `main` window. It is the
allowlist for PLUGIN commands (`plugin:store|…`, `plugin:dialog|…`, …). Our own
`#[tauri::command]`s do NOT need an entry here — they are gated by
`collect_commands![]` in `lib.rs`, not by capabilities.

## Least privilege

- Add the NARROWEST permission that makes the feature work. Prefer a specific
  `allow-*` (e.g. `fs:allow-app-read`) over a plugin's `:default` bundle for
  `fs`/`shell`, which grant broad access.
- Every permission must map to a consuming feature. If a feature is removed,
  remove its permission (the file's own description says to audit for orphans).
- Never widen the `windows` list beyond what a feature needs, and never add
  `remote`/`remoteDomains` grants — this app is local-only.

## CSP (`tauri.conf.json`)

The CSP is deliberately tight: `default-src 'self'`, `font-src 'self'`,
`script-src 'self'`. `connect-src` only allows `ipc:` plus the GitHub hosts the
updater needs. Any loosening (a new `connect-src` host, `img-src`, etc.) needs a
justifying comment explaining exactly which feature requires it.

## After editing

Permission identifiers come from the plugin's docs or the generated schema in
`src-tauri/gen/schemas/`. That schema is regenerated when you run
`pnpm tauri dev` (or a build) — run it after adding a plugin so new permission
identifiers resolve. A runtime `"not allowed"` error means the permission is
missing here; a `"command … not found"` error means the command is missing from
`collect_commands![]` instead.
