use super::*;

pub enum TagChange<'a> {
    Rename { id: i64, new_name: &'a str },
    Delete { id: i64 },
    Attach { paper_id: &'a str, id: i64 },
    Detach { paper_id: &'a str, id: i64 },
}

impl ReadingService {
    pub async fn set_read_status(
        &self,
        app: &AppHandle,
        state: &AppState,
        id: &str,
        status: ReadStatus,
    ) -> Result<()> {
        self.open(app, state, Some(id)).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.set_read_status(state, id, status).await
    }

    pub async fn update_metadata(
        &self,
        app: &AppHandle,
        state: &AppState,
        paper: &Paper,
    ) -> Result<()> {
        self.open(app, state, Some(&paper.id)).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.update_metadata(state, paper).await
    }

    pub async fn delete_paper(&self, app: &AppHandle, state: &AppState, id: &str) -> Result<()> {
        self.open(app, state, None).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.delete_paper(state, id).await
    }

    pub async fn change_tag(
        &self,
        app: &AppHandle,
        state: &AppState,
        change: TagChange<'_>,
    ) -> Result<()> {
        self.open(app, state, None).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.change_tag(state, change).await
    }

    pub async fn refresh_pdf(&self, app: &AppHandle, state: &AppState, id: &str) -> Result<()> {
        self.open(app, state, None).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.refresh_pdf(state, id).await
    }
}

impl Runtime {
    pub(super) async fn set_read_status(
        &mut self,
        state: &AppState,
        id: &str,
        status: ReadStatus,
    ) -> Result<()> {
        self.post(
            &format!("/api/p/{id}/item"),
            &serde_json::json!({
                "status": match status {
                    ReadStatus::Read => "done",
                    ReadStatus::Reading => "reading",
                    ReadStatus::Unread | ReadStatus::Must => "unread",
                },
                "starred": status == ReadStatus::Must,
            }),
        )
        .await?;
        self.project(state).await
    }

    pub(super) async fn update_metadata(&mut self, state: &AppState, paper: &Paper) -> Result<()> {
        self.post(
            "/api/host/metadata",
            &serde_json::json!({
                "id": paper.id, "title": paper.title, "authors": paper.authors,
                "year": paper.year, "venue": paper.venue, "doi": paper.doi,
                "arxiv_id": paper.arxiv_id, "abstract_text": paper.abstract_text,
            }),
        )
        .await?;
        PaperRepo::new(&state.pool).update_metadata(paper).await?;
        self.project(state).await
    }

    pub(super) async fn delete_paper(&mut self, state: &AppState, id: &str) -> Result<()> {
        // Trash the canonical workspace before deleting its derived index row.
        // Otherwise the next sync or reopen would resurrect the paper.
        self.post("/api/host/delete", &serde_json::json!({"id": id}))
            .await?;
        PaperRepo::new(&state.pool).delete(id).await
    }

    pub(super) async fn change_tag(
        &mut self,
        state: &AppState,
        change: TagChange<'_>,
    ) -> Result<()> {
        let repo = TagRepo::new(&state.pool);
        let (id, action, paper_id, new_name) = match &change {
            TagChange::Rename { id, new_name } => (*id, "rename", None, Some(*new_name)),
            TagChange::Delete { id } => (*id, "delete", None, None),
            TagChange::Attach { paper_id, id } => (*id, "attach", Some(*paper_id), None),
            TagChange::Detach { paper_id, id } => (*id, "detach", Some(*paper_id), None),
        };
        let tags = repo.list().await?;
        let tag = tags
            .iter()
            .find(|tag| tag.id == id)
            .context("tag not found")?;
        if let Some(new_name) = new_name {
            if new_name.trim().is_empty() {
                bail!("tag name is required");
            }
            if tags
                .iter()
                .any(|other| other.id != id && other.name == new_name)
            {
                bail!("tag already exists");
            }
        }
        self.post(
            "/api/host/tag",
            &serde_json::json!({
                "action": action, "name": tag.name, "id": paper_id, "new_name": new_name,
            }),
        )
        .await?;
        // Rename the definition before projection so its id and colour survive.
        match change {
            TagChange::Rename { id, new_name } => repo.rename(id, new_name).await?,
            TagChange::Delete { id } => repo.delete(id).await?,
            TagChange::Attach { paper_id, id } => repo.attach(paper_id, id).await?,
            TagChange::Detach { paper_id, id } => repo.detach(paper_id, id).await?,
        }
        self.project(state).await
    }

    pub(super) async fn refresh_pdf(&mut self, state: &AppState, id: &str) -> Result<()> {
        let paper = PaperRepo::new(&state.pool)
            .get(id)
            .await?
            .context("paper not found")?;
        self.attach_legacy(state, &paper).await?;
        self.project(state).await
    }
}
