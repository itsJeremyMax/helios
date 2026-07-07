# Recipe: deep links and launch-on-startup

Two commonly-paired plugins: `tauri-plugin-deep-link` (handle `myapp://...`
URLs) and `tauri-plugin-autostart` (launch on OS login). Both interact with
`tauri-plugin-single-instance`, already registered in
`src-tauri/src/lib.rs`, which is what makes a deep link opened while the app
is already running route to the existing window instead of spawning a
second instance.

## 1. Install

```bash
cd src-tauri
cargo add tauri-plugin-deep-link tauri-plugin-autostart
```

```bash
pnpm add @tauri-apps/plugin-deep-link @tauri-apps/plugin-autostart
```

## 2. Register the URL scheme

In `src-tauri/tauri.conf.json`, add under `bundle`:

```jsonc
"plugins": {
  "deep-link": {
    "desktop": {
      "schemes": ["helios"]
    }
  }
}
```

(Rename `"helios"` if `scripts/setup.mjs` has already stamped this repo out
under a different app name.)

## 3. Register the plugins in `run()`

In `src-tauri/src/lib.rs`, add both plugins to the builder chain — order
matters: deep-link registration must happen, and single-instance's callback
must forward the second-instance argv into the deep-link handler:

```rust
.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    // argv[1] carries the deep-link URL on the second launch; forward it
    // to the frontend the same way the initial-launch case does below.
    let _ = app.emit("deep-link", argv.get(1).cloned());
}))
.plugin(tauri_plugin_deep_link::init())
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```

## 4. Grant capabilities

Add `deep-link:default` and `autostart:default` to the `permissions` array in
`src-tauri/capabilities/default.json` — new plugins are unusable at runtime
without an explicit capability grant, even if registered in `lib.rs`.

## 5. Listen on the frontend

```ts
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'

onOpenUrl((urls) => {
  // route based on urls[0], e.g. window.location.hash = toHashRoute(urls[0])
})
```

## 6. Autostart toggle

Expose it the same way `checkUpdatesOnLaunch` is exposed today: a
`SettingsPatch` field plumbed through `get_settings`/`update_settings`
(`src-tauri/src/commands/settings.rs`), backed by
`tauri_plugin_autostart::ManagerExt::enable()` / `.disable()` calls from a new
command rather than storing autostart state only in the settings store — the
OS-level registration and the persisted preference must be kept in sync
explicitly.
