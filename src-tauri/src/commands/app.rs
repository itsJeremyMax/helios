use crate::error::AppResult;
use crate::state::AppState;

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: String,
    /// Whole seconds since the app process started, read from the managed
    /// [`AppState`]. `u32` (not `u64`) because specta forbids exporting 64-bit
    /// integers to TS (JS number precision); ~136 years of uptime fits.
    pub uptime_seconds: u32,
}

#[tauri::command]
#[specta::specta]
pub fn greet(name: String) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

#[tauri::command]
#[specta::specta]
pub fn app_info<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        uptime_seconds: state.uptime_seconds(),
    })
}
