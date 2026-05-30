use std::sync::Arc;

use tauri::State;
use ulid::Ulid;

use crate::bibtex::generate_bibtex;
use crate::ingest::fetch_arxiv;
use crate::storage::{Paper, PaperRepo};
use crate::AppState;

/// Maximum PDF download size. arXiv preprints typically run 1-20 MB; the long
/// tail of high-resolution scans tops out around 100 MB. Anything beyond 200 MB
/// is almost certainly an attacker streaming junk to OOM the host or a
/// misconfigured server pumping HTML/zip — either way we'd rather fail fast
/// than buffer a multi-gigabyte response.
pub(crate) const PDF_DOWNLOAD_MAX_BYTES: usize = 200 * 1024 * 1024;

pub(crate) async fn download_pdf(
    http: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
) -> anyhow::Result<u64> {
    use std::io::Write;
    let mut resp = http.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("PDF download returned {}", resp.status());
    }
    if let Some(ct) = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
    {
        let lc = ct.to_ascii_lowercase();
        let acceptable = lc.starts_with("application/pdf")
            || lc.starts_with("application/octet-stream")
            || lc.starts_with("binary/octet-stream");
        if !acceptable {
            anyhow::bail!("expected PDF, server returned Content-Type {ct}");
        }
    }
    // Pre-allocate based on Content-Length when present, but never trust it past the cap.
    let hint = resp
        .content_length()
        .map(|n| n.min(PDF_DOWNLOAD_MAX_BYTES as u64) as usize)
        .unwrap_or(64 * 1024);
    let mut buf: Vec<u8> = Vec::with_capacity(hint);
    while let Some(chunk) = resp.chunk().await? {
        if buf.len().saturating_add(chunk.len()) > PDF_DOWNLOAD_MAX_BYTES {
            anyhow::bail!(
                "PDF exceeds {} MB hard cap",
                PDF_DOWNLOAD_MAX_BYTES / (1024 * 1024)
            );
        }
        buf.extend_from_slice(&chunk);
    }
    if buf.len() < 1024 {
        anyhow::bail!(
            "PDF response too small ({} bytes), likely not a valid PDF",
            buf.len()
        );
    }
    if &buf[..5] != b"%PDF-" {
        anyhow::bail!("response does not look like a PDF (missing %PDF- header)");
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f = std::fs::File::create(dest)?;
    f.write_all(&buf)?;
    Ok(buf.len() as u64)
}

#[tauri::command]
pub async fn arxiv_add_with_pdf(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())?;
    let resolved_id = draft.arxiv_id.clone().unwrap_or(arxiv_id.clone());
    let stripped = resolved_id
        .split('v')
        .next()
        .unwrap_or(&resolved_id)
        .to_string();
    // Return existing paper if this arXiv ID is already in the library.
    let repo = PaperRepo::new(&state.pool);
    if let Some(existing) = repo
        .find_by_arxiv_id(&stripped)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(existing);
    }
    let pdf_url = format!("https://arxiv.org/pdf/{stripped}.pdf");
    let paper_id = Ulid::new().to_string();
    let pdf_path = state.paths.paper_dir(&paper_id).join("original.pdf");
    download_pdf(&state.http_external, &pdf_url, &pdf_path)
        .await
        .map_err(|e| format!("failed to download arXiv PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(pdf_path.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}
