use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::State;

use crate::storage::{NewPaperSupplement, PaperRepo, PaperSupplement, PaperSupplementRepo};
use crate::AppState;

const ALLOWED_SUPPLEMENT_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "md", "zip", "rar", "7z",
    "png", "jpg", "jpeg",
];

#[derive(Debug, Serialize)]
pub struct SupplementConversionResult {
    pub supplement: PaperSupplement,
    pub pdf_path: String,
}

#[tauri::command]
pub async fn paper_supplements_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperSupplement>, String> {
    PaperSupplementRepo::new(&state.pool)
        .list(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_supplement_add_file(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    source_path: String,
) -> Result<PaperSupplement, String> {
    if PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err(format!("paper {paper_id} not found"));
    }

    let source = validate_external_supplement(&state, Path::new(&source_path))?;
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "supplement file has no valid file name".to_string())?
        .to_string();
    let extension = file_extension(&source)?;
    let now = Utc::now().timestamp_millis();
    let dest_dir = state.paths.paper_dir(&paper_id).join("supplements");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("create supplement dir: {e}"))?;
    let dest = unique_destination(&dest_dir, &file_name);
    std::fs::copy(&source, &dest).map_err(|e| format!("copy supplement: {e}"))?;

    PaperSupplementRepo::new(&state.pool)
        .insert(
            NewPaperSupplement {
                paper_id,
                title: file_name,
                file_path: dest.display().to_string(),
                file_kind: extension,
            },
            now,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_supplement_update_note(
    state: State<'_, Arc<AppState>>,
    id: i64,
    note: String,
) -> Result<PaperSupplement, String> {
    PaperSupplementRepo::new(&state.pool)
        .update_note(id, &note, Utc::now().timestamp_millis())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_supplement_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    let deleted = PaperSupplementRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(supplement) = deleted {
        remove_library_file(&state, &supplement.file_path).ok();
        if let Some(path) = supplement.converted_pdf_path {
            remove_library_file(&state, &path).ok();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn paper_supplement_open(
    state: State<'_, Arc<AppState>>,
    id: i64,
    prefer_pdf: Option<bool>,
) -> Result<(), String> {
    let supplement = PaperSupplementRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper supplement {id} not found"))?;
    let path = if prefer_pdf.unwrap_or(false) {
        supplement
            .converted_pdf_path
            .as_deref()
            .unwrap_or(&supplement.file_path)
    } else {
        &supplement.file_path
    };
    open_library_file(&state, path)
}

#[tauri::command]
pub async fn paper_supplement_convert_docx_to_pdf(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<SupplementConversionResult, String> {
    let supplement = PaperSupplementRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper supplement {id} not found"))?;
    if !matches!(supplement.file_kind.as_str(), "doc" | "docx") {
        return Err("only Word supplements can be converted to PDF".into());
    }
    let source = state
        .paths
        .ensure_inside_root(Path::new(&supplement.file_path))
        .map_err(|e| format!("refusing to convert out-of-library supplement: {e}"))?;
    let output_dir = source
        .parent()
        .ok_or_else(|| "supplement path has no parent directory".to_string())?;
    let converter = office_converter().ok_or_else(|| {
        "LibreOffice/soffice was not found. Install LibreOffice to convert DOCX supplements to PDF."
            .to_string()
    })?;
    let status = std::process::Command::new(converter)
        .arg("--headless")
        .arg("--convert-to")
        .arg("pdf")
        .arg("--outdir")
        .arg(output_dir)
        .arg(&source)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("start {converter}: {e}"))?;
    if !status.success() {
        return Err(format!("{converter} failed with status {status}"));
    }
    let pdf_path = source.with_extension("pdf");
    if !pdf_path.exists() {
        return Err(format!(
            "conversion finished but PDF was not created: {}",
            pdf_path.display()
        ));
    }
    let pdf = state
        .paths
        .ensure_inside_root(&pdf_path)
        .map_err(|e| format!("converted PDF escaped library root: {e}"))?;
    let updated = PaperSupplementRepo::new(&state.pool)
        .update_converted_pdf_path(
            id,
            &pdf.display().to_string(),
            Utc::now().timestamp_millis(),
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(SupplementConversionResult {
        supplement: updated,
        pdf_path: pdf.display().to_string(),
    })
}

fn validate_external_supplement(state: &AppState, candidate: &Path) -> Result<PathBuf, String> {
    let canon = std::fs::canonicalize(candidate).map_err(|e| {
        format!(
            "supplement source {} cannot be canonicalized: {e}",
            candidate.display()
        )
    })?;
    if !canon.is_file() {
        return Err(format!(
            "supplement source {} is not a regular file",
            canon.display()
        ));
    }
    let ext = file_extension(&canon)?;
    if !ALLOWED_SUPPLEMENT_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("unsupported supplement file type .{ext}"));
    }
    if let Ok(root) = std::fs::canonicalize(&state.paths.root) {
        if canon.starts_with(root) {
            return Err(format!(
                "supplement source {} is already inside the library",
                canon.display()
            ));
        }
    }
    Ok(canon)
}

fn file_extension(path: &Path) -> Result<String, String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| !ext.trim().is_empty())
        .ok_or_else(|| "supplement file has no extension".to_string())
}

fn unique_destination(dir: &Path, file_name: &str) -> PathBuf {
    let mut dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("supplement");
    let ext = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("bin");
    for idx in 1.. {
        dest = dir.join(format!("{stem}-{idx}.{ext}"));
        if !dest.exists() {
            return dest;
        }
    }
    unreachable!()
}

fn open_library_file(state: &AppState, path: &str) -> Result<(), String> {
    let canon = state
        .paths
        .ensure_inside_root(Path::new(path))
        .map_err(|e| format!("refusing to open out-of-library supplement: {e}"))?;
    if !canon.exists() {
        return Err(format!(
            "supplement file does not exist: {}",
            canon.display()
        ));
    }
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
        .map_err(|e| format!("start {opener}: {e}"))?;
    Ok(())
}

fn remove_library_file(state: &AppState, path: &str) -> Result<(), String> {
    let canon = state
        .paths
        .ensure_inside_root(Path::new(path))
        .map_err(|e| format!("refusing to remove out-of-library supplement: {e}"))?;
    if canon.exists() {
        std::fs::remove_file(&canon).map_err(|e| format!("remove {}: {e}", canon.display()))?;
    }
    Ok(())
}

fn office_converter() -> Option<&'static str> {
    if command_exists("soffice") {
        Some("soffice")
    } else if command_exists("libreoffice") {
        Some("libreoffice")
    } else {
        None
    }
}

fn command_exists(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}
