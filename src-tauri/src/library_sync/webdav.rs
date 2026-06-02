use anyhow::{anyhow, Context, Result};
use reqwest::{Client, Method, RequestBuilder, Url};
use std::collections::BTreeSet;

use super::config::WebDavConfig;
use super::local::{
    copy_snapshot_file, manifest_bytes, manifest_from_bytes, stage_downloaded_file, ManifestFile,
    Snapshot, SyncConnectionResult, SyncManifest, SyncTransferStats, MANIFEST_FILE_NAME,
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

    pub async fn upload_snapshot(&self, snapshot: &Snapshot) -> Result<SyncTransferStats> {
        let mut created_dirs = BTreeSet::new();
        let remote_manifest = self.download_manifest_if_present().await?;
        let mut stats = SyncTransferStats::default();
        let stale_paths = stale_remote_paths(&snapshot.manifest, remote_manifest.as_ref());
        self.ensure_remote_dir("").await?;
        for file in &snapshot.manifest.files {
            if self.can_skip_upload(file, remote_manifest.as_ref()).await? {
                stats.skipped_count += 1;
                stats.skipped_bytes += file.size;
                continue;
            }
            stats.file_count += 1;
            stats.total_bytes += file.size;
            self.ensure_parent_dir(file, &mut created_dirs).await?;
            let bytes = std::fs::read(snapshot.root().join(&file.path))
                .with_context(|| format!("read staged file {}", file.path))?;
            self.put_file(&file.path, bytes).await?;
        }
        let manifest = manifest_bytes(&snapshot.manifest)?;
        self.put_file(MANIFEST_FILE_NAME, manifest).await?;
        for stale_path in stale_paths {
            self.delete_file(&stale_path).await?;
        }
        Ok(stats)
    }

    #[cfg(test)]
    pub async fn download_snapshot(&self) -> Result<Snapshot> {
        self.download_snapshot_reusing(None)
            .await
            .map(|(snapshot, _)| snapshot)
    }

    pub async fn download_snapshot_reusing(
        &self,
        local_snapshot: Option<&Snapshot>,
    ) -> Result<(Snapshot, SyncTransferStats)> {
        let manifest_bytes = self.get_file(MANIFEST_FILE_NAME).await?;
        let manifest = manifest_from_bytes(&manifest_bytes)?;
        let mut stats = SyncTransferStats::default();
        let snapshot = Snapshot::new_empty("litera-sync-download", manifest)?;
        for file in &snapshot.manifest.files {
            if can_skip_download(file, local_snapshot) {
                let local_snapshot = local_snapshot.context("skip requested without snapshot")?;
                copy_snapshot_file(local_snapshot, &snapshot, file)?;
                stats.skipped_count += 1;
                stats.skipped_bytes += file.size;
                continue;
            }
            stats.file_count += 1;
            stats.total_bytes += file.size;
            let bytes = self.get_file(&file.path).await?;
            stage_downloaded_file(&snapshot, file, &bytes)?;
        }
        Ok((snapshot, stats))
    }

    async fn download_manifest_if_present(&self) -> Result<Option<super::local::SyncManifest>> {
        let Some(bytes) = self.try_get_file(MANIFEST_FILE_NAME).await? else {
            return Ok(None);
        };
        manifest_from_bytes(&bytes).map(Some)
    }

    async fn can_skip_upload(
        &self,
        local_file: &ManifestFile,
        remote_manifest: Option<&SyncManifest>,
    ) -> Result<bool> {
        let Some(remote_file) = remote_manifest.and_then(|manifest| {
            manifest
                .files
                .iter()
                .find(|file| file.path == local_file.path)
        }) else {
            return Ok(false);
        };
        if !same_manifest_file(local_file, remote_file) {
            return Ok(false);
        }
        self.remote_file_matches_size(&local_file.path, local_file.size)
            .await
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

    async fn delete_file(&self, rel_path: &str) -> Result<()> {
        let response = self
            .request(self.client.delete(self.url_for(rel_path)?))
            .send()
            .await
            .with_context(|| format!("delete stale remote file {rel_path}"))?;
        let status = response.status().as_u16();
        if matches!(status, 200 | 202 | 204 | 404) {
            return Ok(());
        }
        Err(anyhow!(
            "delete stale remote file {rel_path} failed with HTTP {status}"
        ))
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

    async fn try_get_file(&self, rel_path: &str) -> Result<Option<Vec<u8>>> {
        let response = self
            .request(self.client.get(self.url_for(rel_path)?))
            .send()
            .await
            .with_context(|| format!("download {rel_path}"))?;
        let status = response.status().as_u16();
        if status == 404 {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(anyhow!("download {rel_path} failed with HTTP {status}"));
        }
        response
            .bytes()
            .await
            .map(|bytes| Some(bytes.to_vec()))
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

    async fn remote_file_matches_size(&self, rel_path: &str, expected_size: u64) -> Result<bool> {
        let response = self
            .request(self.client.head(self.url_for(rel_path)?))
            .send()
            .await
            .with_context(|| format!("probe remote file size {rel_path}"))?;
        let status = response.status().as_u16();
        if status == 404 {
            return Ok(false);
        }
        if !response.status().is_success() {
            return Err(anyhow!(
                "probe remote file size {rel_path} failed with HTTP {status}"
            ));
        }
        Ok(response.content_length() == Some(expected_size))
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

fn stale_remote_paths(
    local_manifest: &super::local::SyncManifest,
    remote_manifest: Option<&super::local::SyncManifest>,
) -> Vec<String> {
    let Some(remote_manifest) = remote_manifest else {
        return Vec::new();
    };
    let local_paths: BTreeSet<&str> = local_manifest
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    remote_manifest
        .files
        .iter()
        .filter(|file| !local_paths.contains(file.path.as_str()))
        .map(|file| file.path.clone())
        .collect()
}

fn same_manifest_file(left: &ManifestFile, right: &ManifestFile) -> bool {
    left.size == right.size && left.sha256 == right.sha256
}

fn can_skip_download(remote_file: &ManifestFile, local_snapshot: Option<&Snapshot>) -> bool {
    local_snapshot
        .and_then(|snapshot| {
            snapshot
                .manifest
                .files
                .iter()
                .find(|local_file| local_file.path == remote_file.path)
        })
        .is_some_and(|local_file| same_manifest_file(local_file, remote_file))
}

#[cfg(test)]
mod tests;
