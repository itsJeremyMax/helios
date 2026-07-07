---
name: adding-a-tauri-plugin
description: Installs and wires a Tauri plugin — Cargo crate, optional JS package, lib.rs init, capability permission, CSP check, and test mocks. Use when adding a tauri-plugin-* dependency or a new native capability.
---

# Adding a Tauri plugin

## Checklist

1. **Add the Rust crate**: `cargo add tauri-plugin-<x> --manifest-path
   src-tauri/Cargo.toml`. If it is desktop-only (like the updater), put it under
   the existing `[target.'cfg(any(target_os = "macos", windows, target_os =
   "linux"))'.dependencies]` block and init it in `setup` behind `#[cfg(desktop)]`.

2. **Add the JS package** if the plugin has a frontend API:
   `pnpm add @tauri-apps/plugin-<x>`.

3. **Initialize it** in `src-tauri/src/lib.rs`. Most plugins chain onto
   `tauri::Builder::default()`:

   ```rust
   .plugin(tauri_plugin_<x>::init())
   ```

   ORDER MATTERS: `tauri_plugin_single_instance` MUST stay first. Plugins that
   need an `AppHandle` (updater) are added in `setup` instead.

4. **Grant the permission** in `src-tauri/capabilities/default.json`. Add the
   narrowest identifier — prefer a specific `allow-*` over `<x>:default` for
   `fs`/`shell`. Then run `pnpm tauri dev` once to regenerate
   `src-tauri/gen/schemas/` so the identifier resolves. Skipping this →
   runtime `"not allowed"`.

5. **CSP check**: if the plugin talks to the network (updater, http), widen
   `connect-src` in `tauri.conf.json` to the specific host, with a justifying
   comment. Do not loosen `default-src`/`script-src`.

6. **Test mocks**: plugin invokes use the `plugin:<x>|<cmd>` name. For simple
   calls, match them in `mockIPC`. For flows that round-trip native resources
   (rids, event channels — like the updater), mock the plugin MODULE with
   `vi.mock('@tauri-apps/plugin-<x>', …)` instead (see
   `features/updater/update-card.test.tsx`).

7. **Gate**: `pnpm check:all`.
