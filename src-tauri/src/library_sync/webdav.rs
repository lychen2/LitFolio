use anyhow::{anyhow, Context, Result};
use reqwest::{Client, Method, RequestBuilder, Url};
use std::collections::BTreeSet;

use super::config::WebDavConfig;
use super::local::{
    manifest_bytes, manifest_from_bytes, stage_downloaded_file, ManifestFile, Snapshot,
    SyncConnectionResult, MANIFEST_FILE_NAME,
};

pub struct WebDavRemote<'a> {
    client: &'a Client,
    cfg: &'a WebDavConfig,
}

impl<'a> WebDavRemote<'a> {
    pub fn new(client: &'a Client, cfg: &'a WebDavConfig) -> Self {
        Self { client, cfg }
    }

    pub fn remote_root(&self) -> String {
        format!(
            "{}/{}",
            self.cfg.base_url.trim_end_matches('/'),
            self.cfg.remote_path.trim_matches('/')
        )
    }

    pub async fn probe(&self) -> Result<SyncConnectionResult> {
        self.ensure_remote_dir("").await?;
        let method = Method::from_bytes(b"PROPFIND").context("build PROPFIND method")?;
        let url = self.url_for("")?;
        let response = self
            .request(self.client.request(method, url))
            .header("Depth", "0")
            .send()
            .await
            .context("send PROPFIND")?;
        ensure_propfind_status(response.status().as_u16(), &self.remote_root())?;
        Ok(SyncConnectionResult {
            remote_root: self.remote_root(),
        })
    }

    pub async fn upload_snapshot(&self, snapshot: &Snapshot) -> Result<()> {
        let mut created_dirs = BTreeSet::new();
        self.ensure_remote_dir("").await?;
        for file in &snapshot.manifest.files {
            self.ensure_parent_dir(file, &mut created_dirs).await?;
            let bytes = std::fs::read(snapshot.root().join(&file.path))
                .with_context(|| format!("read staged file {}", file.path))?;
            self.put_file(&file.path, bytes).await?;
        }
        let manifest = manifest_bytes(&snapshot.manifest)?;
        self.put_file(MANIFEST_FILE_NAME, manifest).await
    }

    pub async fn download_snapshot(&self) -> Result<Snapshot> {
        let manifest_bytes = self.get_file(MANIFEST_FILE_NAME).await?;
        let manifest = manifest_from_bytes(&manifest_bytes)?;
        let snapshot = Snapshot::new_empty("litera-sync-download", manifest)?;
        for file in &snapshot.manifest.files {
            let bytes = self.get_file(&file.path).await?;
            stage_downloaded_file(&snapshot, file, &bytes)?;
        }
        Ok(snapshot)
    }

    async fn ensure_parent_dir(
        &self,
        file: &ManifestFile,
        created_dirs: &mut BTreeSet<String>,
    ) -> Result<()> {
        let Some((dir, _)) = file.path.rsplit_once('/') else {
            return Ok(());
        };
        if created_dirs.contains(dir) {
            return Ok(());
        }
        self.ensure_remote_dir(dir).await?;
        created_dirs.insert(dir.to_string());
        Ok(())
    }

    async fn ensure_remote_dir(&self, rel_dir: &str) -> Result<()> {
        let mut current = String::new();
        for segment in self.all_segments(rel_dir) {
            if !current.is_empty() {
                current.push('/');
            }
            current.push_str(&segment);
            let method = Method::from_bytes(b"MKCOL").context("build MKCOL method")?;
            let response = self
                .request(
                    self.client
                        .request(method, self.url_for_base_relative(&current)?),
                )
                .send()
                .await
                .with_context(|| format!("create remote directory {current}"))?;
            let status = response.status().as_u16();
            if status == 409 && self.remote_collection_exists(&current).await? {
                continue;
            }
            ensure_mkcol_status(status, &current)?;
        }
        Ok(())
    }

    async fn put_file(&self, rel_path: &str, bytes: Vec<u8>) -> Result<()> {
        let response = self
            .request(self.client.put(self.url_for(rel_path)?))
            .body(bytes)
            .send()
            .await
            .with_context(|| format!("upload {rel_path}"))?;
        let status = response.status().as_u16();
        if matches!(status, 200 | 201 | 204) {
            return Ok(());
        }
        Err(anyhow!("upload {rel_path} failed with HTTP {status}"))
    }

    async fn get_file(&self, rel_path: &str) -> Result<Vec<u8>> {
        let response = self
            .request(self.client.get(self.url_for(rel_path)?))
            .send()
            .await
            .with_context(|| format!("download {rel_path}"))?;
        let status = response.status().as_u16();
        if !response.status().is_success() {
            return Err(anyhow!("download {rel_path} failed with HTTP {status}"));
        }
        response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .with_context(|| format!("read response body for {rel_path}"))
    }

    fn request(&self, request: RequestBuilder) -> RequestBuilder {
        if self.cfg.username.trim().is_empty() {
            return request;
        }
        request.basic_auth(self.cfg.username.trim(), Some(self.cfg.password.as_str()))
    }

    fn url_for(&self, rel_path: &str) -> Result<Url> {
        self.url_for_existing(rel_path)
    }

    fn url_for_existing(&self, rel_path: &str) -> Result<Url> {
        let mut url = Url::parse(self.cfg.base_url.trim()).context("parse WebDAV base URL")?;
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| anyhow!("WebDAV base URL cannot be a base"))?;
            segments.pop_if_empty();
            for segment in self.all_segments(rel_path) {
                segments.push(&segment);
            }
        }
        Ok(url)
    }

    fn url_for_base_relative(&self, rel_path: &str) -> Result<Url> {
        let mut url = Url::parse(self.cfg.base_url.trim()).context("parse WebDAV base URL")?;
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| anyhow!("WebDAV base URL cannot be a base"))?;
            segments.pop_if_empty();
            for segment in rel_path
                .trim_matches('/')
                .split('/')
                .filter(|segment| !segment.is_empty())
            {
                segments.push(segment);
            }
        }
        Ok(url)
    }

    fn all_segments(&self, rel_path: &str) -> Vec<String> {
        self.cfg
            .remote_path
            .trim_matches('/')
            .split('/')
            .chain(rel_path.trim_matches('/').split('/'))
            .filter(|segment| !segment.is_empty())
            .map(ToOwned::to_owned)
            .collect()
    }

    async fn remote_collection_exists(&self, rel_path: &str) -> Result<bool> {
        let method = Method::from_bytes(b"PROPFIND").context("build PROPFIND method")?;
        let response = self
            .request(
                self.client
                    .request(method, self.url_for_base_relative(rel_path)?),
            )
            .header("Depth", "0")
            .send()
            .await
            .with_context(|| format!("probe remote directory {rel_path}"))?;
        Ok(matches!(response.status().as_u16(), 200 | 207))
    }
}

fn ensure_propfind_status(status: u16, remote_root: &str) -> Result<()> {
    if matches!(status, 200 | 207) {
        return Ok(());
    }
    Err(anyhow!(
        "WebDAV PROPFIND for {remote_root} failed with HTTP {status}"
    ))
}

fn ensure_mkcol_status(status: u16, remote_dir: &str) -> Result<()> {
    if matches!(status, 201 | 301 | 302 | 405) {
        return Ok(());
    }
    Err(anyhow!(
        "WebDAV MKCOL for {remote_dir} failed with HTTP {status}"
    ))
}

#[cfg(test)]
mod tests;
