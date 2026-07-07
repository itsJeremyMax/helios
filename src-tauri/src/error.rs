use serde::{Serialize, Serializer};

/// Application-wide error type crossing the Tauri IPC boundary.
///
/// It serializes to a stable, tagged JSON shape `{ kind, message }` so the
/// frontend can branch on `kind` without depending on Rust's internal enum
/// layout. See [`ErrorPayload`] for the wire/TS representation.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(String),
    #[error("store error: {0}")]
    Store(String),
    #[error("{0}")]
    Other(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

/// Wire + TypeScript representation of [`AppError`]: `{ kind, message }`.
///
/// `AppError` delegates both its `Serialize` and `specta::Type` impls here so
/// the runtime JSON and the generated TS type can never drift apart.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    kind: String,
    message: String,
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            Self::Io(_) => "io",
            Self::Store(_) => "store",
            Self::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            kind: self.kind().to_string(),
            message: self.to_string(),
        }
        .serialize(s)
    }
}

// A derived `specta::Type` on the enum would export a tagged union that does
// not match our custom `Serialize`. Delegating to `ErrorPayload` guarantees the
// exported TS type is exactly `{ kind: string; message: string }`.
impl specta::Type for AppError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <ErrorPayload as specta::Type>::definition(types)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_tagged_payload() {
        let e = AppError::Io("boom".into());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["kind"], "io");
        assert!(json["message"].as_str().unwrap().contains("boom"));
    }
}
