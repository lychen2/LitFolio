// End-to-end test: resolve DOI via Sci-Hub and download the PDF.
// Usage: cargo run --example test-scihub

use litera_lib::{fetch_scihub_pdf_url, scihub_download_pdf};

#[tokio::main]
async fn main() {
    let doi = "10.1038/35107000";
    let dest = std::path::Path::new("/tmp/test-scihub-e2e.pdf");
    let _ = std::fs::remove_file(dest);

    let client = reqwest::Client::builder()
        .user_agent("LitFolio/0.3 (+https://github.com/ZonaZcy/litera-desktop)")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .unwrap();

    eprintln!("=== Step 1: resolve PDF URL for DOI {doi} ===");
    match fetch_scihub_pdf_url(&client, doi).await {
        Ok(Some(pdf_url)) => {
            eprintln!("OK  -> PDF URL: {pdf_url}");

            eprintln!("\n=== Step 2: download PDF ===");
            match scihub_download_pdf(&pdf_url, doi, dest).await {
                Ok(_size) => {
                    let meta = std::fs::metadata(dest).unwrap();
                    eprintln!("OK  -> {} bytes written to {}", meta.len(), dest.display());
                    eprintln!("SUCCESS");
                }
                Err(e) => eprintln!("FAIL: download error: {e:#}"),
            }
        }
        Ok(None) => eprintln!("FAIL: no PDF URL found on any mirror"),
        Err(e) => eprintln!("FAIL: resolve error: {e:#}"),
    }
}
