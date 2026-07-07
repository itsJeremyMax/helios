use tauri::Manager;

mod commands;
mod error;
mod state;
mod tray;

pub use error::{AppError, AppResult};

/// Single source of truth for the typed IPC surface. Both the runtime
/// invoke handler and the generated TypeScript bindings are derived from this
/// builder, so a command only needs to be registered once, here.
fn specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    // Commands that take `AppHandle<R>`/`State` are generic over the runtime so
    // the same handler can be built for `Wry` (production) AND the mock runtime
    // used by the command-wiring test in `mod tests`. The `::<tauri::Wry>`
    // turbofish only feeds tauri-specta's TYPE generation (runtime-independent,
    // so the concrete choice is irrelevant); the runtime invoke handler strips
    // it and infers the real runtime `R` from the builder.
    tauri_specta::Builder::<R>::new().commands(tauri_specta::collect_commands![
        commands::app::greet,
        commands::app::app_info::<tauri::Wry>,
        commands::settings::get_settings::<tauri::Wry>,
        commands::settings::update_settings::<tauri::Wry>,
        commands::settings::reset_app_data::<tauri::Wry>,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Setup-time panic is intentional: if the Tauri app fails to start, there is
// no meaningful way to recover, so we fail fast with a clear message.
#[allow(clippy::expect_used)]
pub fn run() {
    // Installed before anything else so a panic anywhere during startup or
    // while the app is running — including on background threads Tauri
    // spawns internally — lands in the log file with a full backtrace
    // instead of only ever reaching stderr.
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        log::error!("panic: {info}\n{backtrace}");
    }));

    let builder = specta_builder::<tauri::Wry>();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        // Managed application state, shared with every command via
        // `tauri::State`. Read by `commands::app::app_info` (uptime).
        .manage(state::AppState::new())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("helios".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .max_file_size(2_000_000)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            tray::create(app)?;
            // The updater plugin is desktop-only; mobile ships through the app
            // stores and has no in-app update path.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            // Launch-at-startup is a desktop concept (login items / launch
            // agents); mobile lifecycle is OS-managed. `LaunchAgent` is the
            // sanctioned macOS mechanism; `Some(vec![])` passes no extra args on
            // autostart. The stored preference is driven Rust-side in
            // `commands::settings`, so no webview capability is required.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![]),
            ))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    // Regenerates `src/bindings.ts` on every `cargo test` run. CI then fails if
    // the checked-in bindings are stale via `git diff --exit-code`.
    #[test]
    fn export_bindings() {
        super::specta_builder::<tauri::Wry>()
            .export(
                specta_typescript::Typescript::default(),
                "../src/bindings.ts",
            )
            .expect("failed to export bindings");
    }

    // Command-wiring test: build a real mock app with the ACTUAL invoke handler
    // and managed state, then drive `app_info` across the IPC boundary exactly
    // as the webview would. This catches registration/serialization/state-wiring
    // regressions the pure unit tests can't. Because `app_info` reads the
    // managed `AppState`, this also exercises end-to-end managed-state access.
    #[test]
    fn app_info_command_is_wired_and_reads_state() {
        use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};

        let app = mock_builder()
            .manage(super::state::AppState::new())
            .invoke_handler(super::specta_builder().invoke_handler())
            .build(mock_context(noop_assets()))
            .expect("failed to build mock app");

        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("failed to build mock webview");

        let response = get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "app_info".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                // Must resolve as a LOCAL origin (the app's tauri protocol),
                // otherwise the ACL treats it as remote and rejects the call.
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::default(),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("app_info returned an error over IPC");

        // Over raw IPC a successful `Result` command returns the PLAIN payload
        // (the `{ status, data }` envelope is added by tauri-specta on the TS
        // side, not by Rust).
        let data: serde_json::Value = response.deserialize().expect("non-JSON response");
        assert!(data["version"].is_string());
        assert!(data["platform"].is_string());
        // The managed AppState was read: uptime is present as a number.
        assert!(data["uptimeSeconds"].is_u64());
    }
}
