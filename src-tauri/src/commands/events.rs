use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub(crate) fn emit_or_warn<T>(app: &AppHandle, event: &'static str, payload: &T)
where
    T: Serialize,
{
    if let Err(error) = app.emit(event, payload) {
        tracing::warn!(%error, event, "failed to emit frontend event");
    }
}
