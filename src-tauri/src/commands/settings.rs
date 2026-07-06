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

/// Salvage the known fields out of an arbitrary settings blob, defaulting
/// anything missing or unparsable. Used both for older (v0/unknown-older)
/// payloads and for corrupt current-version payloads.
fn salvage(value: &serde_json::Value) -> Settings {
    let mut s = Settings::default();
    if let Some(t) = value
        .get("theme")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
    {
        s.theme = t;
    }
    if let Some(c) = value
        .get("checkUpdatesOnLaunch")
        .and_then(serde_json::Value::as_bool)
    {
        s.check_updates_on_launch = c;
    }
    s
}

/// Migrate any older stored shape to the current schema. Kept as a pure
/// function so the migration logic is unit-testable without a running app.
///
/// Returns the usable [`Settings`] plus whether it is safe to persist the
/// result back to disk (`true`) or whether the caller must leave the
/// on-disk blob untouched (`false`).
pub fn migrate(value: serde_json::Value) -> (Settings, bool) {
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    match version {
        CURRENT_SCHEMA_VERSION_U64 => match serde_json::from_value(value.clone()) {
            // Clean roundtrip: nothing changed, no need to write back.
            Ok(s) => (s, false),
            // Corrupt current-version payload: salvage what we can, but this
            // *does* need to be persisted since we're rewriting the shape.
            Err(_) => (salvage(&value), true),
        },
        // Future schema version: this data was written by a newer build of
        // the app that may store richer fields we don't know about yet.
        // Parse leniently so this (older) build stays usable, but do NOT
        // persist — writing our salvage back would downgrade/destroy the
        // newer build's data the next time it runs. The tradeoff: this
        // older build won't see (or preserve) fields it doesn't understand,
        // but it also won't clobber them.
        v if v > CURRENT_SCHEMA_VERSION_U64 => (salvage(&value), false),
        // v0 (or unknown-older): salvage known fields, defaults for the
        // rest, and it's safe to persist the upgraded shape.
        _ => (salvage(&value), true),
    }
}

fn load(app: &tauri::AppHandle) -> AppResult<(Settings, bool)> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    let result = match store.get(SETTINGS_KEY) {
        Some(v) => migrate(v),
        None => (Settings::default(), true),
    };
    Ok(result)
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
    let (s, persist) = load(&app)?;
    if persist {
        save(&app, &s)?; // persists migration result, only when safe to do so
    }
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn update_settings(app: tauri::AppHandle, patch: SettingsPatch) -> AppResult<Settings> {
    let (mut s, _persist) = load(&app)?;
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
        let (s, persist) = migrate(old);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Dark);
        assert!(s.check_updates_on_launch);
        // v0/unknown-older payloads are safe to upgrade in place.
        assert!(persist);
    }

    #[test]
    fn current_version_roundtrips() {
        let s = Settings {
            theme: Theme::Light,
            ..Default::default()
        };
        let v = serde_json::to_value(&s).unwrap();
        let (migrated, persist) = migrate(v);
        assert_eq!(migrated, s);
        // A clean current-version load is a no-op; don't write on every read.
        assert!(!persist);
    }

    #[test]
    fn migrates_future_version_without_persisting() {
        // A newer, unrecognised schema version means a newer build of the
        // app wrote this data. Salvage known fields so this (older) build
        // stays usable, but the result must NOT be persisted: doing so
        // would overwrite the newer build's richer settings on disk the
        // next time it runs.
        let future = serde_json::json!({ "schemaVersion": 999, "theme": "light" });
        let (s, persist) = migrate(future);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Light);
        assert!(s.check_updates_on_launch);
        assert!(!persist);
    }

    #[test]
    fn migrates_corrupt_current_version_preserving_theme() {
        // A malformed current-version blob (e.g. wrong type for an unrelated
        // field) should still salvage individually-parseable fields like
        // `theme` rather than resetting everything to defaults.
        let corrupt = serde_json::json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "theme": "dark",
            "checkUpdatesOnLaunch": "not-a-bool",
        });
        let (s, persist) = migrate(corrupt);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Dark);
        assert!(s.check_updates_on_launch);
        // The shape needed to be repaired, so it should be written back.
        assert!(persist);
    }
}
