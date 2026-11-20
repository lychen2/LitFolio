use std::path::Path;

use anyhow::{ensure, Context, Result};
use serde::{de::IgnoredAny, Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Wry};

use super::Runtime;

#[derive(Clone)]
pub(super) struct AndroidReadingPlugin(PluginHandle<Wry>);

#[derive(Serialize)]
struct StartService<'a> {
    home: &'a Path,
    library: &'a Path,
}

#[derive(Deserialize)]
struct StartedService {
    url: String,
}

pub(crate) fn init() -> TauriPlugin<Wry> {
    Builder::new("reading-service")
        .setup(|app, api| {
            let handle = api.register_android_plugin("dev.litera.desktop", "ReadingPlugin")?;
            app.manage(AndroidReadingPlugin(handle));
            Ok(())
        })
        .build()
}

impl AndroidReadingPlugin {
    pub(super) async fn start(&self, home: &Path, library: &Path) -> Result<Runtime> {
        std::fs::create_dir_all(home)?;
        std::fs::create_dir_all(library)?;
        let started: StartedService = self
            .0
            .run_mobile_plugin_async("startService", StartService { home, library })
            .await
            .context("start Android reading service")?;

        let result = async {
            let url =
                url::Url::parse(&started.url).context("invalid Android reading service URL")?;
            ensure!(
                url.scheme() == "http"
                    && url.host_str() == Some("127.0.0.1")
                    && url.port().is_some_and(|port| port != 0)
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.path() == "/"
                    && url.query().is_none()
                    && url.fragment().is_none(),
                "expected an Android reading service loopback URL"
            );
            Runtime::connect(self.clone(), url.as_str().trim_end_matches('/').to_owned()).await
        }
        .await;
        if result.is_err() {
            self.stop().await;
        }
        result
    }

    pub(super) async fn stop(&self) {
        if let Err(error) = self
            .0
            .run_mobile_plugin_async::<IgnoredAny>("stopService", ())
            .await
        {
            tracing::warn!(%error, "stop Android reading service failed");
        }
    }
}
