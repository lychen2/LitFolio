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
pub async fn paper_read_pdf_bytes(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<u8>, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
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
    std::fs::read(&canon).map_err(|e| format!("read pdf {}: {e}", canon.display()))
}
