//! Opens the canonical LitFolio surface for an existing LitFolio paper.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::reading_service::{ReadingService, ReadingSession};
use crate::AppState;

#[tauri::command]
pub async fn reading_service_open(
    app: AppHandle,
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
    id: Option<String>,
) -> Result<ReadingSession, String> {
    service.open(&app, &state, id.as_deref()).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn reading_service_sync(
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    service.sync_catalog(&state).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn reading_service_position_note_ime(
    webview: tauri::Webview,
    x: f64,
    y: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::{InputMethodContextExt, WebViewExt};

        webview.with_webview(move |platform_webview| {
            let view = platform_webview.inner();
            if let Some(context) = view.input_method_context() {
                let zoom = view.zoom_level();
                context.notify_cursor_area(
                    (x * zoom).round() as i32,
                    (y * zoom).round() as i32,
                    1,
                    (height * zoom).round().max(1.0) as i32,
                );
            }
        }).map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (webview, x, y, height);
    Ok(())
}
