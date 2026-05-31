use std::path::Path;
use std::sync::Arc;

use tauri::State;
use ulid::Ulid;

use crate::bibtex::generate_bibtex;
use crate::ingest::PaperDraft;
use crate::storage::{Paper, PaperRepo};
use crate::AppState;

#[tauri::command]
pub async fn paper_save_with_pdf(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
    source_pdf_path: String,
) -> Result<Paper, String> {
    paper_save_with_pdf_inner(state.inner().as_ref(), draft, &source_pdf_path).await
}

async fn paper_save_with_pdf_inner(
    state: &AppState,
    draft: PaperDraft,
    source_pdf_path: &str,
) -> Result<Paper, String> {
    let canon_source = state
        .paths
        .validate_external_pdf(Path::new(&source_pdf_path))
        .map_err(|e| format!("拒绝导入: {e}"))?;
    let paper_id = Ulid::new().to_string();
    let dest = state.paths.paper_dir(&paper_id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&canon_source, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(dest.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn paper_attach_pdf(
    state: State<'_, Arc<AppState>>,
    id: String,
    source_pdf_path: String,
) -> Result<Paper, String> {
    let repo = PaperRepo::new(&state.pool);
    if repo.get(&id).await.map_err(|e| e.to_string())?.is_none() {
        return Err(format!("paper {id} not found"));
    }
    let canon_source = state
        .paths
        .validate_external_pdf(Path::new(&source_pdf_path))
        .map_err(|e| format!("拒绝绑定: {e}"))?;
    let dest = state.paths.paper_dir(&id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create paper dir: {e}"))?;
    }
    std::fs::copy(&canon_source, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let dest_str = dest.display().to_string();
    repo.update_pdf_path(&id, &dest_str)
        .await
        .map_err(|e| e.to_string())?;
    repo.get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper vanished after update".to_string())
}

#[tauri::command]
pub async fn paper_open_pdf(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF,请先点击 📎 添加 PDF".to_string())?;
    if !std::path::Path::new(&path).exists() {
        return Err(format!("PDF 文件不存在(已被删除或移动):{path}"));
    }
    // Reject paths that escape the library root before handing them to the system viewer.
    let canon = state
        .paths
        .ensure_inside_root(std::path::Path::new(&path))
        .map_err(|e| format!("拒绝打开越界路径: {e}"))?;
    let opener = if cfg!(target_os = "linux") {
        "xdg-open"
    } else if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        return Err("unsupported OS".into());
    };
    std::process::Command::new(opener)
        .arg(&canon)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 {opener} 失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn paper_pdf_asset_path(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<String, String> {
    paper_pdf_asset_path_inner(state.inner().as_ref(), &id).await
}

async fn paper_pdf_asset_path_inner(state: &AppState, id: &str) -> Result<String, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF".to_string())?;
    let canon = state
        .paths
        .ensure_inside_root(std::path::Path::new(&path))
        .map_err(|e| format!("拒绝读取越界路径: {e}"))?;
    Ok(canon.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{notes, open_pool, run_migrations, HighlightRepo, LibraryPaths};
    use tokio::sync::Mutex as AsyncMutex;
    use tokio_util::sync::CancellationToken;

    #[tokio::test]
    async fn save_read_highlight_and_note_roundtrip() {
        let (state, library_root, source_root) = test_state().await;
        let source_pdf = source_root.join("source.pdf");
        std::fs::write(&source_pdf, b"%PDF-1.4\n%fixture\n%%EOF\n").unwrap();
        let draft = PaperDraft {
            title: "Integration PDF".into(),
            authors: vec!["Ada Lovelace".into()],
            year: Some(2026),
            venue: Some("Integration Venue".into()),
            doi: Some("10.0000/integration".into()),
            arxiv_id: None,
            abstract_text: Some("A command-level integration fixture.".into()),
        };

        let paper = paper_save_with_pdf_inner(&state, draft, source_pdf.to_str().unwrap())
            .await
            .unwrap();
        let stored = PaperRepo::new(&state.pool)
            .get(&paper.id)
            .await
            .unwrap()
            .expect("stored paper");
        let canon_library_root = std::fs::canonicalize(&library_root).unwrap();
        assert_eq!(stored.title, "Integration PDF");
        assert!(
            std::path::Path::new(stored.pdf_path.as_deref().unwrap()).starts_with(&library_root)
        );
        let asset_path = paper_pdf_asset_path_inner(&state, &paper.id).await.unwrap();
        assert!(std::path::Path::new(&asset_path).starts_with(&canon_library_root));

        let highlight_repo = HighlightRepo::new(&state.pool);
        let rect = serde_json::json!({
            "boundingRect": {"x1": 1, "y1": 2, "x2": 3, "y2": 4},
            "rects": [],
            "pageNumber": 1
        });
        let highlight = highlight_repo
            .insert(&paper.id, 1, &rect, "important passage", None, Some("Key"))
            .await
            .unwrap();
        highlight_repo
            .update_note(&highlight.id, Some("reader note"))
            .await
            .unwrap();
        let highlights = highlight_repo.list_by_paper(&paper.id).await.unwrap();
        assert_eq!(highlights[0].note.as_deref(), Some("reader note"));

        notes::write(&state.paths, &paper.id, "# Paper note").unwrap();
        assert_eq!(
            notes::read(&state.paths, &paper.id).unwrap(),
            "# Paper note"
        );
        state.pool.close().await;
        std::fs::remove_dir_all(library_root).ok();
        std::fs::remove_dir_all(source_root).ok();
    }

    async fn test_state() -> (AppState, std::path::PathBuf, std::path::PathBuf) {
        let library_root = std::env::temp_dir().join(format!("litera-pdf-it-{}", Ulid::new()));
        let source_root = std::env::temp_dir().join(format!("litera-pdf-src-{}", Ulid::new()));
        std::fs::create_dir_all(&library_root).unwrap();
        std::fs::create_dir_all(&source_root).unwrap();
        let pool = open_pool(&library_root.join("library.sqlite"))
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        let state = AppState {
            pool,
            paths: LibraryPaths::new(&library_root),
            http: reqwest::Client::new(),
            http_external: reqwest::Client::new(),
            batch_cancel: AsyncMutex::new(None::<CancellationToken>),
            sync_lock: AsyncMutex::new(()),
        };
        (state, library_root, source_root)
    }
}
