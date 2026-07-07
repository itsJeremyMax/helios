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
    /// Whether the app registers itself to launch when the user logs in. The
    /// OS autostart registration is the source of truth: [`get_settings`]
    /// reconciles this field against the live registration on read, and
    /// [`update_settings`] drives the registration when this changes.
    pub launch_at_startup: bool,
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
            launch_at_startup: false,
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
    pub launch_at_startup: Option<bool>,
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
    if let Some(l) = value
        .get("launchAtStartup")
        .and_then(serde_json::Value::as_bool)
    {
        s.launch_at_startup = l;
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

fn load<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> AppResult<(Settings, bool)> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    let result = match store.get(SETTINGS_KEY) {
        Some(v) => migrate(v),
        None => (Settings::default(), true),
    };
    Ok(result)
}

fn save<R: tauri::Runtime>(app: &tauri::AppHandle<R>, settings: &Settings) -> AppResult<()> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    store.set(
        SETTINGS_KEY,
        serde_json::to_value(settings).map_err(|e| AppError::Store(e.to_string()))?,
    );
    store.save().map_err(|e| AppError::Store(e.to_string()))
}

/// Apply a partial [`SettingsPatch`] to the current on-disk `raw` value and
/// compute both the typed [`Settings`] to return AND the exact JSON value that
/// should be written back to the store.
///
/// Kept pure (no running app) so the downgrade-safety behaviour is unit
/// testable. The subtle case this guards against: when the store was written
/// by a NEWER build (stored `schemaVersion` > [`CURRENT_SCHEMA_VERSION`], i.e.
/// [`migrate`] reported `persist == false`), we must NOT serialize our
/// narrower [`Settings`] over it — that would silently drop fields this older
/// build doesn't understand. Instead we patch only the changed keys onto the
/// RAW stored object, so the newer build's unknown fields survive the round
/// trip. For our-schema-or-older data it is safe to write the full typed value.
fn apply_patch(
    raw: Option<serde_json::Value>,
    patch: &SettingsPatch,
) -> AppResult<(Settings, serde_json::Value)> {
    let (mut settings, persist_typed) = match &raw {
        Some(v) => migrate(v.clone()),
        None => (Settings::default(), true),
    };
    if let Some(t) = patch.theme {
        settings.theme = t;
    }
    if let Some(c) = patch.check_updates_on_launch {
        settings.check_updates_on_launch = c;
    }
    if let Some(l) = patch.launch_at_startup {
        settings.launch_at_startup = l;
    }

    let to_store = if persist_typed {
        // Our-schema-or-older (or brand new): safe to persist the full typed shape.
        serde_json::to_value(&settings).map_err(|e| AppError::Store(e.to_string()))?
    } else {
        // Newer-schema data on disk: merge onto the raw object so unknown
        // fields (and the newer schemaVersion) are preserved, not clobbered.
        let mut obj = match raw {
            Some(serde_json::Value::Object(m)) => m,
            _ => serde_json::Map::new(),
        };
        if let Some(t) = patch.theme {
            obj.insert(
                "theme".to_string(),
                serde_json::to_value(t).map_err(|e| AppError::Store(e.to_string()))?,
            );
        }
        if let Some(c) = patch.check_updates_on_launch {
            obj.insert(
                "checkUpdatesOnLaunch".to_string(),
                serde_json::Value::Bool(c),
            );
        }
        if let Some(l) = patch.launch_at_startup {
            obj.insert("launchAtStartup".to_string(), serde_json::Value::Bool(l));
        }
        serde_json::Value::Object(obj)
    };
    Ok((settings, to_store))
}

/// Drive the OS-level "launch at login" registration to `enabled`, keeping it
/// in lockstep with the stored preference. The autostart plugin (and thus the
/// managed `AutoLaunchManager`) is desktop-only, so this is a no-op elsewhere.
///
/// Registration can fail (permissions, sandboxing, an OS that refuses the
/// launch agent), so this returns [`AppError::Other`] rather than panicking.
#[cfg(desktop)]
fn set_autostart<R: tauri::Runtime>(app: &tauri::AppHandle<R>, enabled: bool) -> AppResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| {
        AppError::Other(format!(
            "failed to {} launch-at-startup: {e}",
            if enabled { "enable" } else { "disable" }
        ))
    })
}

/// Reconcile `settings.launch_at_startup` against the live OS registration,
/// which is the source of truth (an external change — e.g. the user removing
/// the login item in System Settings — must be reflected). Returns whether the
/// stored value changed and therefore needs persisting. Best-effort: if the
/// registration can't be read we log and leave the stored value as-is rather
/// than failing the whole settings read.
#[cfg(desktop)]
fn reconcile_autostart<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &mut Settings,
) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    match app.autolaunch().is_enabled() {
        Ok(enabled) => {
            if settings.launch_at_startup != enabled {
                settings.launch_at_startup = enabled;
                return true;
            }
            false
        }
        Err(e) => {
            log::warn!("could not read launch-at-startup state: {e}");
            false
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> AppResult<Settings> {
    let (s, persist) = load(&app)?;
    // The OS registration is authoritative, so fold its live state into the
    // returned settings (and persist if it diverged from disk).
    #[cfg(desktop)]
    let (s, persist) = {
        let mut s = s;
        let mut persist = persist;
        if reconcile_autostart(&app, &mut s) {
            persist = true;
        }
        (s, persist)
    };
    if persist {
        save(&app, &s)?; // persists migration/reconcile result, only when safe
    }
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn update_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    patch: SettingsPatch,
) -> AppResult<Settings> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Store(e.to_string()))?;
    // Compute the value to persist from the RAW stored blob so that data
    // written by a newer schema is merged, not overwritten (see `apply_patch`).
    let (settings, to_store) = apply_patch(store.get(SETTINGS_KEY), &patch)?;
    // When the patch flips launch-at-startup, drive the OS registration BEFORE
    // persisting: if it fails we surface the error and leave settings.json
    // untouched rather than recording a preference that never took effect.
    #[cfg(desktop)]
    if let Some(enabled) = patch.launch_at_startup {
        set_autostart(&app, enabled)?;
    }
    store.set(SETTINGS_KEY, to_store);
    store.save().map_err(|e| AppError::Store(e.to_string()))?;
    Ok(settings)
}

#[tauri::command]
#[specta::specta]
pub fn reset_app_data<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> AppResult<Settings> {
    let s = Settings::default();
    // Defaults disable launch-at-startup, so tear down the OS registration to
    // match. Best-effort: a failed deregistration shouldn't block the reset of
    // every other preference.
    #[cfg(desktop)]
    if let Err(e) = set_autostart(&app, s.launch_at_startup) {
        log::warn!("reset_app_data: {e}");
    }
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
        // Fields absent from an older payload fall back to their defaults.
        assert!(!s.launch_at_startup);
        // v0/unknown-older payloads are safe to upgrade in place.
        assert!(persist);
    }

    #[test]
    fn migrates_unversioned_value_salvaging_launch_at_startup() {
        // A launch-at-startup preference stored by an older shape must survive
        // the migration rather than reset to the default (false).
        let old = serde_json::json!({ "theme": "dark", "launchAtStartup": true });
        let (s, persist) = migrate(old);
        assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(s.launch_at_startup);
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

    #[test]
    fn update_preserves_unknown_fields_from_newer_schema() {
        // The store was written by a NEWER build: it carries a higher
        // schemaVersion plus a field this build has never heard of. Applying a
        // patch must NOT clobber that data.
        let on_disk = serde_json::json!({
            "schemaVersion": 999,
            "theme": "light",
            "checkUpdatesOnLaunch": true,
            "futureOnlyField": "keep-me",
        });
        let patch = SettingsPatch {
            theme: Some(Theme::Dark),
            check_updates_on_launch: None,
            launch_at_startup: None,
        };

        let (settings, to_store) = apply_patch(Some(on_disk), &patch).unwrap();

        // The returned typed settings reflect the patch for known fields.
        assert_eq!(settings.theme, Theme::Dark);
        // The value written back keeps the newer build's schemaVersion and its
        // unknown field intact — the newer data is NOT destroyed.
        assert_eq!(to_store["schemaVersion"], 999);
        assert_eq!(to_store["futureOnlyField"], "keep-me");
        // The patched key is applied onto the raw object...
        assert_eq!(to_store["theme"], "dark");
        // ...and the untouched known field is preserved as-is.
        assert_eq!(to_store["checkUpdatesOnLaunch"], true);
    }

    #[test]
    fn update_writes_full_typed_settings_for_current_schema() {
        // Current-schema data: it is safe to serialize the full typed shape.
        let on_disk = serde_json::json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "theme": "light",
            "checkUpdatesOnLaunch": true,
        });
        let patch = SettingsPatch {
            theme: None,
            check_updates_on_launch: Some(false),
            launch_at_startup: None,
        };

        let (settings, to_store) = apply_patch(Some(on_disk), &patch).unwrap();

        assert!(!settings.check_updates_on_launch);
        assert_eq!(to_store["schemaVersion"], CURRENT_SCHEMA_VERSION);
        assert_eq!(to_store["checkUpdatesOnLaunch"], false);
        assert_eq!(to_store["theme"], "light");
    }

    #[test]
    fn update_from_empty_store_writes_defaults_plus_patch() {
        let patch = SettingsPatch {
            theme: Some(Theme::Dark),
            check_updates_on_launch: None,
            launch_at_startup: None,
        };
        let (settings, to_store) = apply_patch(None, &patch).unwrap();
        assert_eq!(settings.theme, Theme::Dark);
        assert_eq!(to_store["schemaVersion"], CURRENT_SCHEMA_VERSION);
        assert_eq!(to_store["theme"], "dark");
        // Default when unspecified.
        assert!(!settings.launch_at_startup);
    }

    #[test]
    fn update_applies_launch_at_startup_patch() {
        // The settings-plumbing side of the toggle: a launchAtStartup patch is
        // applied to both the returned typed value and the persisted blob. (The
        // OS registration side-effect lives in `update_settings` and can't be
        // exercised headless — see `set_autostart`.)
        let on_disk = serde_json::json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "theme": "light",
            "checkUpdatesOnLaunch": true,
            "launchAtStartup": false,
        });
        let patch = SettingsPatch {
            theme: None,
            check_updates_on_launch: None,
            launch_at_startup: Some(true),
        };

        let (settings, to_store) = apply_patch(Some(on_disk), &patch).unwrap();

        assert!(settings.launch_at_startup);
        assert_eq!(to_store["launchAtStartup"], true);
        // Untouched fields are preserved.
        assert_eq!(to_store["theme"], "light");
        assert_eq!(to_store["checkUpdatesOnLaunch"], true);
    }

    #[test]
    fn update_preserves_launch_at_startup_under_newer_schema() {
        // Raw-merge path: a launchAtStartup patch onto newer-schema data must
        // preserve the unknown field and bump only the patched key.
        let on_disk = serde_json::json!({
            "schemaVersion": 999,
            "theme": "light",
            "checkUpdatesOnLaunch": true,
            "launchAtStartup": false,
            "futureOnlyField": "keep-me",
        });
        let patch = SettingsPatch {
            theme: None,
            check_updates_on_launch: None,
            launch_at_startup: Some(true),
        };

        let (settings, to_store) = apply_patch(Some(on_disk), &patch).unwrap();

        assert!(settings.launch_at_startup);
        assert_eq!(to_store["launchAtStartup"], true);
        assert_eq!(to_store["schemaVersion"], 999);
        assert_eq!(to_store["futureOnlyField"], "keep-me");
    }
}
