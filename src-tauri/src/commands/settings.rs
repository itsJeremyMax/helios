use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

/// Name of the store file settings are persisted to (relative to the app data
/// dir, managed by `tauri-plugin-store`).
pub const SETTINGS_FILE: &str = "settings.json";
/// Current on-disk schema version. Bump when the persisted shape changes and
/// extend [`migrate`] to translate older payloads.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;
/// Store key the serialized [`Settings`] blob lives under.
const SETTINGS_KEY: &str = "settings";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    pub theme: Theme,
    pub check_updates_on_launch: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            theme: Theme::System,
            check_updates_on_launch: true,
        }
    }
}

/// Partial update payload: only present fields are applied, everything else is
/// left untouched.
#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub theme: Option<Theme>,
    pub check_updates_on_launch: Option<bool>,
}

const CURRENT_SCHEMA_VERSION_U64: u64 = CURRENT_SCHEMA_VERSION as u64;

/// Migrate any older stored shape to the current schema. Kept as a pure
/// function so the migration logic is unit-testable without a running app.
pub fn migrate(value: serde_json::Value) -> Settings {
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    match version {
        CURRENT_SCHEMA_VERSION_U64 => serde_json::from_value(value).unwrap_or_default(),
        // v0 (or unknown): salvage known fields, defaults for the rest.
        _ => {
            let mut s = Settings::default();
            if let Some(t) = value
                .get("theme")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
            {
                s.theme = t;
            }
            s
        }
    }
}

fn load(app: &tauri::AppHandle) -> AppResult<Settings> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    let settings = match store.get(SETTINGS_KEY) {
        Some(v) => migrate(v),
        None => Settings::default(),
    };
    Ok(settings)
}

fn save(app: &tauri::AppHandle, settings: &Settings) -> AppResult<()> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    store.set(
        SETTINGS_KEY,
        serde_json::to_value(settings).map_err(|e| AppError::Store(e.to_string()))?,
    );
    store.save().map_err(|e| AppError::Store(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: tauri::AppHandle) -> AppResult<Settings> {
    let s = load(&app)?;
    save(&app, &s)?; // persists migration result
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn update_settings(app: tauri::AppHandle, patch: SettingsPatch) -> AppResult<Settings> {
    let mut s = load(&app)?;
    if let Some(t) = patch.theme {
        s.theme = t;
    }
    if let Some(c) = patch.check_updates_on_launch {
        s.check_updates_on_launch = c;
    }
    save(&app, &s)?;
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn reset_app_data(app: tauri::AppHandle) -> AppResult<Settings> {
    let s = Settings::default();
    save(&app, &s)?;
    Ok(s)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn migrates_unversioned_value_preserving_theme() {
        let old = serde_json::json!({ "theme": "dark" });
        let s = migrate(old);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Dark);
        assert!(s.check_updates_on_launch);
    }

    #[test]
    fn current_version_roundtrips() {
        let s = Settings {
            theme: Theme::Light,
            ..Default::default()
        };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(migrate(v), s);
    }

    #[test]
    fn migrates_unknown_version_salvaging_known_fields() {
        // A newer, unrecognised schema is treated like v0: known fields are
        // salvaged and the rest reset to defaults, keeping the app usable.
        let future = serde_json::json!({ "schemaVersion": 999, "theme": "light" });
        let s = migrate(future);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Light);
        assert!(s.check_updates_on_launch);
    }
}
