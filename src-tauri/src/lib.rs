mod commands;
mod error;

pub use error::{AppError, AppResult};

/// Single source of truth for the typed IPC surface. Both the runtime
/// invoke handler and the generated TypeScript bindings are derived from this
/// builder, so a command only needs to be registered once, here.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::app::greet,
        commands::app::app_info,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Setup-time panic is intentional: if the Tauri app fails to start, there is
// no meaningful way to recover, so we fail fast with a clear message.
#[allow(clippy::expect_used)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
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
        super::specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/bindings.ts",
            )
            .expect("failed to export bindings");
    }
}
