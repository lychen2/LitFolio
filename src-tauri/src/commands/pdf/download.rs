use std::net::IpAddr;
use std::sync::Arc;

use tauri::State;
use ulid::Ulid;

use super::common::generate_and_index_pdf_markdown_or_warn;
use crate::bibtex::generate_bibtex;
use crate::ingest::{
    fetch_arxiv, fetch_doi, fetch_doi_pdf_links, fetch_scihub_pdf_url, scihub_download_pdf,
};
use crate::storage::{Paper, PaperRepo};
use crate::AppState;

const DOI_NO_PUBLIC_PDF: &str = "DOI_AUTO_DOWNLOAD_NO_PUBLIC_PDF";
const DOI_PUBLIC_PDF_FAILED: &str = "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED";
const DOI_ALL_METHODS_FAILED: &str = "DOI_AUTO_DOWNLOAD_ALL_FAILED";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CrossRefDownloadOutcome {
    NoPublicLinks,
    PublicLinksFailed,
    LookupFailed,
}

fn doi_error_code_for_crossref(outcome: CrossRefDownloadOutcome) -> &'static str {
    match outcome {
        CrossRefDownloadOutcome::NoPublicLinks => DOI_NO_PUBLIC_PDF,
        CrossRefDownloadOutcome::PublicLinksFailed => DOI_PUBLIC_PDF_FAILED,
        CrossRefDownloadOutcome::LookupFailed => DOI_ALL_METHODS_FAILED,
    }
}

fn doi_auto_download_error(code: &str, detail: impl AsRef<str>) -> String {
    format!("{code}: {}", detail.as_ref().trim())
}

fn summarize_download_url(value: &str) -> String {
    let Ok(mut url) = reqwest::Url::parse(value) else {
        return value.to_string();
    };
    url.set_query(None);
    url.set_fragment(None);
    url.to_string()
}

fn safe_error_detail(error: impl ToString) -> String {
    error
        .to_string()
        .split_whitespace()
        .map(safe_error_token)
        .collect::<Vec<_>>()
        .join(" ")
}

fn safe_error_token(token: &str) -> String {
    let trimmed = token.trim_matches(|c: char| matches!(c, '(' | ')' | ',' | ';' | ':'));
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return token.replace(trimmed, &summarize_download_url(trimmed));
    }
    token.to_string()
}

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
    validate_pdf_download_url(url).await?;
    let mut resp = http
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("request failed: {}", e.without_url()))?;
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
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| anyhow::anyhow!("read response chunk failed: {}", e.without_url()))?
    {
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
    let tmp = temp_download_path(dest);
    let write_result = (|| -> anyhow::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&buf)?;
        std::fs::rename(&tmp, dest)?;
        Ok(())
    })();
    if let Err(err) = write_result {
        std::fs::remove_file(&tmp).ok();
        return Err(err);
    }
    Ok(buf.len() as u64)
}

fn temp_download_path(dest: &std::path::Path) -> std::path::PathBuf {
    let file_name = dest
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    dest.with_file_name(format!("{file_name}.{}.tmp", Ulid::new()))
}

async fn validate_pdf_download_url(value: &str) -> anyhow::Result<()> {
    let url = reqwest::Url::parse(value)?;
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        anyhow::bail!("refusing PDF download from non-http(s) URL");
    }
    if is_private_or_special_download_url(&url) {
        anyhow::bail!("refusing PDF download from private/internal address");
    }
    reject_private_dns_answers(&url).await?;
    Ok(())
}

async fn reject_private_dns_answers(url: &reqwest::Url) -> anyhow::Result<()> {
    let Some(host) = url.host_str() else {
        anyhow::bail!("PDF download URL has no host");
    };
    let normalized = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    if normalized.parse::<IpAddr>().is_ok() {
        return Ok(());
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let addrs = tokio::net::lookup_host((normalized, port)).await?;
    for addr in addrs {
        if is_private_or_special_ip(addr.ip()) {
            anyhow::bail!(
                "refusing PDF download from hostname resolving to private/internal address"
            );
        }
    }
    Ok(())
}

fn is_private_or_special_download_url(url: &reqwest::Url) -> bool {
    let Some(raw) = url.host_str() else {
        return true;
    };
    let host = raw
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(raw);
    if matches!(
        host,
        "localhost" | "metadata.google.internal" | "metadata" | "169.254.169.254"
    ) {
        return true;
    }
    let Ok(ip) = host.parse::<IpAddr>() else {
        return false;
    };
    is_private_or_special_ip(ip)
}

fn is_private_or_special_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_private()
                || ip.is_link_local()
                || ip.octets()[0] == 0
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return is_private_or_special_ip(IpAddr::V4(v4));
            }
            let segments = ip.segments();
            ip.is_loopback()
                || ip.is_unspecified()
                || (segments[0] & 0xfe00) == 0xfc00
                || (segments[0] & 0xffc0) == 0xfe80
        }
    }
}

struct FinalizePaperRequest<'a> {
    repo: &'a PaperRepo<'a>,
    pdf_path: &'a std::path::Path,
    draft: crate::ingest::PaperDraft,
    paper_id: String,
    existing: Option<Paper>,
    pool: &'a sqlx::SqlitePool,
    paths: &'a crate::storage::LibraryPaths,
    http: &'a reqwest::Client,
}

async fn finalize_paper(request: FinalizePaperRequest<'_>) -> Result<Paper, String> {
    let FinalizePaperRequest {
        repo,
        pdf_path,
        draft,
        paper_id,
        existing,
        pool,
        paths,
        http,
    } = request;
    if let Some(existing) = existing {
        let dest_str = pdf_path.display().to_string();
        repo.update_pdf_path(&existing.id, &dest_str)
            .await
            .map_err(|e| e.to_string())?;
        generate_and_index_pdf_markdown_or_warn(pool, paths, http, &existing.id, pdf_path).await;
        return repo
            .get(&existing.id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "paper vanished after pdf update".to_string());
    }
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(pdf_path.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));
    repo.insert(&paper).await.map_err(|e| e.to_string())?;
    generate_and_index_pdf_markdown_or_warn(pool, paths, http, &paper.id, pdf_path).await;
    Ok(paper)
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
    generate_and_index_pdf_markdown_or_warn(
        &state.pool,
        &state.paths,
        &state.http,
        &paper.id,
        &pdf_path,
    )
    .await;
    Ok(paper)
}

#[tauri::command]
pub async fn doi_add_with_pdf(
    state: State<'_, Arc<AppState>>,
    doi: String,
) -> Result<Paper, String> {
    let draft = fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())?;
    let normalized_doi = draft
        .doi
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| doi.trim().to_string());
    let repo = PaperRepo::new(&state.pool);
    let existing = repo
        .find_by_doi(&normalized_doi)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(existing) = existing.as_ref().filter(|paper| {
        paper
            .pdf_path
            .as_deref()
            .is_some_and(|path| !path.trim().is_empty())
    }) {
        return Ok(existing.clone());
    }

    let paper_id = existing
        .as_ref()
        .map(|paper| paper.id.clone())
        .unwrap_or_else(|| Ulid::new().to_string());
    let pdf_path = state.paths.paper_dir(&paper_id).join("original.pdf");

    let mut failures: Vec<String> = Vec::new();

    // 1) Try Sci-Hub first.
    match fetch_scihub_pdf_url(&state.http, &normalized_doi).await {
        Ok(Some(sci_url)) => {
            let tmp_pdf_path = temp_download_path(&pdf_path);
            match scihub_download_pdf(&sci_url, &normalized_doi, &tmp_pdf_path).await {
                Ok(size) if size as usize <= PDF_DOWNLOAD_MAX_BYTES => {
                    if let Err(e) = std::fs::rename(&tmp_pdf_path, &pdf_path) {
                        std::fs::remove_file(&tmp_pdf_path).ok();
                        failures.push(format!("Sci-Hub finalize: {e}"));
                    } else {
                        return finalize_paper(FinalizePaperRequest {
                            repo: &repo,
                            pdf_path: &pdf_path,
                            draft,
                            paper_id,
                            existing,
                            pool: &state.pool,
                            paths: &state.paths,
                            http: &state.http,
                        })
                        .await;
                    }
                }
                Ok(size) => {
                    std::fs::remove_file(&tmp_pdf_path).ok();
                    failures.push(format!(
                        "Sci-Hub download({}): PDF exceeds {} MB hard cap ({} bytes)",
                        summarize_download_url(&sci_url),
                        PDF_DOWNLOAD_MAX_BYTES / (1024 * 1024),
                        size
                    ));
                }
                Err(e) => {
                    std::fs::remove_file(&tmp_pdf_path).ok();
                    failures.push(format!(
                        "Sci-Hub download({}): {}",
                        summarize_download_url(&sci_url),
                        safe_error_detail(e)
                    ));
                }
            }
        }
        Ok(None) => failures.push("Sci-Hub: no PDF URL resolved for this DOI".into()),
        Err(e) => failures.push(format!("Sci-Hub URL resolve: {}", safe_error_detail(e))),
    }

    // 2) Fall back to publisher-declared CrossRef public PDF links.
    let mut crossref_outcome = CrossRefDownloadOutcome::LookupFailed;
    match fetch_doi_pdf_links(&state.http, &normalized_doi).await {
        Ok(links) if !links.is_empty() => {
            crossref_outcome = CrossRefDownloadOutcome::PublicLinksFailed;
            for link in &links {
                match download_pdf(&state.http_external, link, &pdf_path).await {
                    Ok(_) => {
                        return finalize_paper(FinalizePaperRequest {
                            repo: &repo,
                            pdf_path: &pdf_path,
                            draft,
                            paper_id,
                            existing,
                            pool: &state.pool,
                            paths: &state.paths,
                            http: &state.http,
                        })
                        .await;
                    }
                    Err(e) => failures.push(format!(
                        "CrossRef({}): {}",
                        summarize_download_url(link),
                        safe_error_detail(e)
                    )),
                }
            }
        }
        Ok(_) => {
            crossref_outcome = CrossRefDownloadOutcome::NoPublicLinks;
            failures.push("CrossRef: no public PDF link declared".into());
        }
        Err(e) => failures.push(format!("CrossRef PDF links: {}", safe_error_detail(e))),
    }

    let detail = format!(
        "both Sci-Hub and CrossRef failed for DOI {normalized_doi}. Select a local PDF manually. Details: {}",
        failures.join("; ")
    );
    Err(doi_auto_download_error(
        doi_error_code_for_crossref(crossref_outcome),
        detail,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doi_error_formats_code_and_detail() {
        let error = doi_auto_download_error(
            DOI_PUBLIC_PDF_FAILED,
            "  CrossRef(https://example.test/a.pdf): expected PDF  ",
        );

        assert_eq!(
            error,
            "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED: CrossRef(https://example.test/a.pdf): expected PDF"
        );
    }

    #[test]
    fn crossref_outcome_selects_doi_error_code() {
        assert_eq!(
            doi_error_code_for_crossref(CrossRefDownloadOutcome::NoPublicLinks),
            DOI_NO_PUBLIC_PDF
        );
        assert_eq!(
            doi_error_code_for_crossref(CrossRefDownloadOutcome::PublicLinksFailed),
            DOI_PUBLIC_PDF_FAILED
        );
        assert_eq!(
            doi_error_code_for_crossref(CrossRefDownloadOutcome::LookupFailed),
            DOI_ALL_METHODS_FAILED
        );
    }

    #[test]
    fn download_url_summary_strips_query_and_fragment() {
        assert_eq!(
            summarize_download_url("https://publisher.test/paper.pdf?token=secret#page=1"),
            "https://publisher.test/paper.pdf"
        );
    }

    #[test]
    fn safe_error_detail_strips_url_query_and_fragment() {
        assert_eq!(
            safe_error_detail(
                "GET https://api.crossref.org/works/10.1/example?mailto=a@example.test#frag failed",
            ),
            "GET https://api.crossref.org/works/10.1/example failed"
        );
    }

    #[tokio::test]
    async fn pdf_download_url_validation_rejects_internal_targets() {
        for url in [
            "http://127.0.0.1/file.pdf",
            "http://localhost/file.pdf",
            "http://169.254.169.254/latest/meta-data",
            "http://10.0.0.5/file.pdf",
            "http://[::ffff:127.0.0.1]/file.pdf",
            "ftp://example.com/file.pdf",
        ] {
            assert!(validate_pdf_download_url(url).await.is_err(), "{url}");
        }
        assert!(validate_pdf_download_url("https://8.8.8.8/file.pdf")
            .await
            .is_ok());
    }
}
