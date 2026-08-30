//! Zotero push commands.

use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::storage::{
    get_pushed_at, notes, record_push, NoteSectionRepo, Paper, PaperRepo, TagRepo,
};
use crate::zotero::{config, ZoteroClient};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct ZoteroTarget {
    pub id: String,
    pub name: String,
    pub level: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZoteroPushResult {
    pub pushed: usize,
    pub skipped: Vec<String>,
    pub session_ids: Vec<String>,
}

#[tauri::command]
pub fn zotero_get_config() -> Result<config::ZoteroConfig, String> {
    config::load_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn zotero_save_config(cfg: config::ZoteroConfig) -> Result<(), String> {
    let target_id = cfg
        .target_id
        .as_deref()
        .ok_or_else(|| "Zotero target collection is required".to_string())?;
    if !(target_id.starts_with("L") || target_id.starts_with("C")) {
        return Err("invalid Zotero target collection".into());
    }
    config::save_config(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn zotero_test() -> Result<(), String> {
    ZoteroClient::default()
        .ping()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn zotero_list_targets() -> Result<Vec<ZoteroTarget>, String> {
    ZoteroClient::default()
        .list_targets()
        .await
        .map(|targets| {
            targets
                .into_iter()
                .map(|target| ZoteroTarget {
                    id: target.id,
                    name: target.name,
                    level: target.level,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn zotero_push(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
    force: Option<bool>,
) -> Result<ZoteroPushResult, String> {
    if paper_ids.is_empty() {
        return Err("at least one paper is required".into());
    }
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let target_id = cfg
        .configured()
        .map(|(id, _)| id.to_string())
        .ok_or_else(|| "Zotero target collection is not configured".to_string())?;
    let repo = PaperRepo::new(&state.pool);
    let client = ZoteroClient::default();
    let mut result = ZoteroPushResult {
        pushed: 0,
        skipped: Vec::new(),
        session_ids: Vec::new(),
    };

    for paper_id in paper_ids {
        if !force.unwrap_or(false)
            && get_pushed_at(&state.pool, &paper_id)
                .await
                .map_err(|e| e.to_string())?
                .is_some()
        {
            result.skipped.push(paper_id);
            continue;
        }
        let paper = repo
            .get(&paper_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("paper {paper_id} not found"))?;
        let item = build_item(&state, &paper)
            .await
            .map_err(|e| e.to_string())?;
        let session_id = client
            .save_items(json!([item]), &target_id)
            .await
            .map_err(|e| e.to_string())?;
        record_push(&state.pool, &paper.id, Utc::now().timestamp())
            .await
            .map_err(|e| e.to_string())?;
        result.pushed += 1;
        result.session_ids.push(session_id);
    }
    Ok(result)
}

async fn build_item(state: &AppState, paper: &Paper) -> anyhow::Result<Value> {
    let tags = TagRepo::new(&state.pool).for_paper(&paper.id).await?;
    let mut notes_json = Vec::new();

    let quick_read = [
        paper.research_question.as_deref().map(|v| ("Problem", v)),
        paper.method.as_deref().map(|v| ("Method", v)),
        paper.comparison.as_deref().map(|v| ("Comparison", v)),
        paper.limitations.as_deref().map(|v| ("Limitations", v)),
    ]
    .into_iter()
    .flatten()
    .map(|(label, value)| format!("## {label}\n\n{value}"))
    .collect::<Vec<_>>();
    let sections = NoteSectionRepo::new(&state.pool)
        .list_by_paper(&paper.id)
        .await?;
    let structured = sections
        .into_iter()
        .filter(|section| !section.content.trim().is_empty())
        .map(|section| format!("## {}\n\n{}", section.section_key, section.content))
        .collect::<Vec<_>>();
    let reading_note = notes::read(&state.paths, &paper.id)?;

    if paper.tldr.is_some() || !quick_read.is_empty() || !structured.is_empty() {
        let mut body = Vec::new();
        if let Some(tldr) = paper.tldr.as_deref() {
            body.push(format!("## TL;DR\n\n{tldr}"));
        }
        body.extend(quick_read);
        body.extend(structured);
        notes_json.push(json!({ "note": body.join("\n\n") }));
    }
    if paper.title_translated.is_some() || paper.abstract_translated.is_some() {
        let mut body = Vec::new();
        if let Some(title) = paper.title_translated.as_deref() {
            body.push(format!("## Title\n\n{title}"));
        }
        if let Some(abstract_text) = paper.abstract_translated.as_deref() {
            body.push(format!("## Abstract\n\n{abstract_text}"));
        }
        notes_json.push(json!({ "note": body.join("\n\n") }));
    }
    if !reading_note.trim().is_empty() {
        notes_json.push(json!({ "note": reading_note }));
    }

    let creators: Vec<Value> = paper
        .authors
        .iter()
        .map(|author| {
            let mut parts = author.split_whitespace().collect::<Vec<_>>();
            let last_name = parts.pop().unwrap_or(author).to_string();
            json!({
                "creatorType": "author",
                "firstName": parts.join(" "),
                "lastName": last_name
            })
        })
        .collect();
    let mut item = json!({
        "itemType": "journalArticle",
        "title": paper.title,
        "creators": creators,
        "abstractNote": paper.abstract_text.clone().unwrap_or_default(),
        "tags": tags.into_iter().map(|tag| json!({ "tag": tag.name })).collect::<Vec<_>>(),
        "notes": notes_json,
    });
    let obj = item.as_object_mut().expect("item object");
    if let Some(year) = paper.year {
        obj.insert("date".into(), json!(year.to_string()));
    }
    if let Some(venue) = &paper.venue {
        obj.insert("publicationTitle".into(), json!(venue));
    }
    if let Some(doi) = &paper.doi {
        obj.insert("DOI".into(), json!(doi));
    }
    if let Some(arxiv) = &paper.arxiv_id {
        obj.insert(
            "url".into(),
            json!(format!("https://arxiv.org/abs/{arxiv}")),
        );
    }
    Ok(item)
}
