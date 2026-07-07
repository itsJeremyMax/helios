//! Process-wide application state shared across commands via Tauri's managed
//! state. Kept intentionally small: this is the reference pattern for wiring a
//! managed `AppState` end-to-end (constructed and `.manage()`d in `lib.rs`,
//! read by a real command in `commands::app::app_info`).

use std::time::Instant;

/// State owned by the running application and shared with every command through
/// [`tauri::State`].
///
/// Tracks the process start time so commands can report uptime. A monotonic
/// [`Instant`] is read-only after construction, so no interior mutability
/// (`Mutex`/`RwLock`) is required here; add one only when a field actually
/// needs to be mutated across commands.
pub struct AppState {
    /// Monotonic clock reading captured when the app started.
    started_at: Instant,
}

impl AppState {
    /// Capture the current instant as the app's start time.
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }

    /// Whole seconds elapsed since the app started, saturating into `u32`
    /// (the wire type; see `commands::app::AppInfo::uptime_seconds`).
    pub fn uptime_seconds(&self) -> u32 {
        u32::try_from(self.started_at.elapsed().as_secs()).unwrap_or(u32::MAX)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
