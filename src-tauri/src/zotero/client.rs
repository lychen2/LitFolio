//! Client for Zotero's desktop connector HTTP server (127.0.0.1:23119).
//!
//! Push flow per Zotero's own connector implementation (server_connector.js /
//! saveSession.js): POST /connector/saveItems with metadata + child notes,
//! then POST /connector/updateSession with a treeViewID target ("L1"/"C23")
//! to move the saved items into the configured collection.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

pub const CONNECTOR_BASE: &str = "http://127.0.0.1:23119";
const API_VERSION: &str = "3";
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectorTarget {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub level: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SelectedCollection {
    #[serde(default)]
    pub targets: Vec<ConnectorTarget>,
}

pub struct ZoteroClient {
    http: reqwest::Client,
}

impl ZoteroClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .expect("static client config"),
        }
    }

    async fn post(&self, path: &str, body: &serde_json::Value) -> Result<reqwest::Response> {
        self.http
            .post(format!("{CONNECTOR_BASE}{path}"))
            .header("X-Zotero-API-Version", API_VERSION)
            .json(body)
            .send()
            .await
            .context("Zotero connector request failed (is Zotero desktop running?)")
    }

    /// Probe whether Zotero's connector server is reachable.
    pub async fn ping(&self) -> Result<()> {
        let resp = self
            .post("/connector/ping", &json!({}))
            .await?;
        if !resp.status().is_success() && resp.status().as_u16() != 404 {
            return Err(anyhow!("Zotero connector ping returned {}", resp.status()));
        }
        Ok(())
    }

    /// List all editable libraries and collections as a flat tree.
    pub async fn list_targets(&self) -> Result<Vec<ConnectorTarget>> {
        let resp = self
            .post("/connector/getSelectedCollection", &json!({}))
            .await?
            .error_for_status()
            .context("Zotero getSelectedCollection failed")?;
        let parsed: SelectedCollection = resp.json().await.context("parse targets")?;
        Ok(parsed.targets)
    }

    /// Save items (metadata + child notes) and move them to `target_id`.
    /// Returns the sessionID used, for traceability.
    pub async fn save_items(&self, items: serde_json::Value, target_id: &str) -> Result<String> {
        let session_id = format!("litfolio-{}", ulid::Ulid::new());
        let resp = self
            .post(
                "/connector/saveItems",
                &json!({
                    "sessionID": session_id,
                    "items": items,
                    "uri": "https://litfolio.local/"
                }),
            )
            .await?
            .error_for_status()
            .context("Zotero saveItems failed")?;
        // Body may be empty; parse leniently.
        let _ = resp.text().await;

        self.http
            .post(format!("{CONNECTOR_BASE}/connector/updateSession"))
            .header("X-Zotero-API-Version", API_VERSION)
            .json(&json!({
                "sessionID": session_id,
                "target": target_id
            }))
            .send()
            .await
            .context("Zotero updateSession failed")?
            .error_for_status()
            .context("Zotero updateSession failed")?;

        Ok(session_id)
    }
}

impl Default for ZoteroClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_parse() {
        let t: ConnectorTarget =
            serde_json::from_str(r#"{"id":"C3","name":"Inbox","filesEditable":true,"level":1}"#)
                .unwrap();
        assert_eq!(t.id, "C3");
        assert_eq!(t.level, 1);
    }
}
