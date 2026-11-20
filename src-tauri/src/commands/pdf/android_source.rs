//! Resolve Android picker URIs using the app's temporary read grant.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::os::fd::FromRawFd;
use std::path::{Component, Path, PathBuf};

use anyhow::{anyhow, bail, ensure, Context, Result};
use jni::objects::{JObject, JString, JValue};
use jni::JNIEnv;
use tauri::{AppHandle, Manager};
use tempfile::TempDir;

pub(super) struct StagedPdf {
    path: PathBuf,
    _dir: TempDir,
}

impl StagedPdf {
    pub(super) async fn open(app: &AppHandle, uri: &str) -> Result<Self> {
        let cache = app.path().app_cache_dir()?;
        let uri = uri.to_owned();
        with_content_resolver(app, move |env, resolver| stage(env, resolver, &uri, &cache)).await
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }
}

pub(super) async fn document_names(app: &AppHandle, uris: Vec<String>) -> Result<Vec<Option<String>>> {
    with_content_resolver(app, move |env, resolver| {
        Ok(uris
            .iter()
            .map(|uri| {
                if !uri.starts_with("content://") {
                    return None;
                }
                let name = env.with_local_frame(16, |env| {
                    let uri = parse_uri(env, uri)?;
                    display_name(env, resolver, &uri)
                });
                if name.is_err() {
                    let _ = env.exception_clear();
                }
                name.ok()
            })
            .collect())
    })
    .await
}

async fn with_content_resolver<T, F>(app: &AppHandle, operation: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce(&mut JNIEnv<'_>, &JObject<'_>) -> Result<T> + Send + 'static,
{
    let webview = app
        .get_webview_window("main")
        .context("main webview unavailable")?;
    let (send, receive) = tokio::sync::oneshot::channel();
    webview.with_webview(move |view| {
        view.jni_handle().exec(move |env, activity, _| {
            let resolver = env.with_local_frame(4, |env| -> Result<_> {
                let resolver = env
                    .call_method(
                        activity,
                        "getContentResolver",
                        "()Landroid/content/ContentResolver;",
                        &[],
                    )?
                    .l()?;
                Ok((env.get_java_vm()?, env.new_global_ref(resolver)?))
            });
            if resolver.is_err() {
                let _ = env.exception_clear();
            }
            let _ = send.send(resolver);
        });
    })?;
    let (vm, resolver) = receive
        .await
        .context("Android content resolver unavailable")??;
    tokio::task::spawn_blocking(move || {
        let mut env = vm.attach_current_thread()?;
        let result = operation(&mut env, resolver.as_obj());
        if result.is_err() {
            let _ = env.exception_clear();
        }
        result
    })
    .await?
}

pub(super) fn file_uri_path(uri: &str) -> Result<PathBuf> {
    url::Url::parse(uri)?
        .to_file_path()
        .map_err(|()| anyhow!("invalid local file URI"))
}

fn parse_uri<'local>(env: &mut JNIEnv<'local>, uri: &str) -> Result<JObject<'local>> {
    let uri = env.new_string(uri)?;
    let parsed = env.call_static_method(
        "android/net/Uri",
        "parse",
        "(Ljava/lang/String;)Landroid/net/Uri;",
        &[JValue::Object(&uri)],
    )?;
    Ok(parsed.l()?)
}

fn stage(
    env: &mut JNIEnv<'_>,
    resolver: &JObject<'_>,
    uri: &str,
    cache: &Path,
) -> Result<StagedPdf> {
    let uri = parse_uri(env, uri)?;
    let name = display_name(env, resolver, &uri).context("read PDF display name from Android")?;
    let mut components = Path::new(&name).components();
    ensure!(
        matches!(components.next(), Some(Component::Normal(part)) if part == name.as_str())
            && components.next().is_none(),
        "Android provider returned an invalid PDF display name"
    );
    let (mut source, offset, length) = open_asset(env, resolver, &uri)
        .context("open PDF from Android; select the file again if its read access expired")?;
    if offset != 0 {
        source.seek(SeekFrom::Start(offset))?;
    }
    let dir = tempfile::Builder::new()
        .prefix("pdf-import-")
        .tempdir_in(cache)?;
    let path = dir.path().join(name);
    let mut dest = File::create_new(&path)?;
    let mut source = source.take(length.unwrap_or(u64::MAX));
    let mut header = [0; 5];
    source.read_exact(&mut header).context("read PDF header")?;
    ensure!(&header == b"%PDF-", "selected document is not a PDF");
    dest.write_all(&header)?;
    io::copy(&mut source, &mut dest).context("copy Android PDF to app cache")?;
    ensure!(
        length.is_none() || source.limit() == 0,
        "Android PDF ended before its declared length"
    );
    Ok(StagedPdf { path, _dir: dir })
}

fn display_name(env: &mut JNIEnv<'_>, resolver: &JObject<'_>, uri: &JObject<'_>) -> Result<String> {
    // OpenableColumns.DISPLAY_NAME. The URI path contains provider IDs, not filenames.
    let column = env.new_string("_display_name")?;
    let projection = env.new_object_array(1, "java/lang/String", &column)?;
    let null = JObject::null();
    let cursor = env.call_method(
        resolver,
        "query",
        "(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;",
        &[
            JValue::Object(uri),
            JValue::Object(&projection),
            JValue::Object(&null),
            JValue::Object(&null),
            JValue::Object(&null),
        ],
    )?.l()?;
    ensure!(
        !cursor.is_null(),
        "Android provider returned no PDF metadata"
    );
    let name = (|| -> Result<String> {
        let index = env
            .call_method(
                &cursor,
                "getColumnIndex",
                "(Ljava/lang/String;)I",
                &[JValue::Object(&column)],
            )?
            .i()?;
        ensure!(
            index >= 0 && env.call_method(&cursor, "moveToFirst", "()Z", &[])?.z()?,
            "Android provider returned no PDF display name"
        );
        let name = JString::from(
            env.call_method(
                &cursor,
                "getString",
                "(I)Ljava/lang/String;",
                &[JValue::Int(index)],
            )?
            .l()?,
        );
        ensure!(
            !name.is_null(),
            "Android provider returned no PDF display name"
        );
        let name = env.get_string(&name)?.into();
        Ok(name)
    })();
    if name.is_err() {
        env.exception_clear()?;
    }
    let closed = env.call_method(&cursor, "close", "()V", &[]);
    let name = name?;
    closed?;
    Ok(name)
}

fn open_asset(
    env: &mut JNIEnv<'_>,
    resolver: &JObject<'_>,
    uri: &JObject<'_>,
) -> Result<(File, u64, Option<u64>)> {
    let mode = env.new_string("r")?;
    let asset = env
        .call_method(
            resolver,
            "openAssetFileDescriptor",
            "(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/res/AssetFileDescriptor;",
            &[JValue::Object(uri), JValue::Object(&mode)],
        )?
        .l()?;
    ensure!(
        !asset.is_null(),
        "Android provider returned no readable PDF"
    );
    let opened = (|| -> Result<_> {
        let offset = env.call_method(&asset, "getStartOffset", "()J", &[])?.j()?;
        let length = env
            .call_method(&asset, "getDeclaredLength", "()J", &[])?
            .j()?;
        let parcel = env
            .call_method(
                &asset,
                "getParcelFileDescriptor",
                "()Landroid/os/ParcelFileDescriptor;",
                &[],
            )?
            .l()?;
        let offset = u64::try_from(offset).context("invalid Android PDF offset")?;
        let fd = env.call_method(&parcel, "detachFd", "()I", &[])?.i()?;
        if fd < 0 {
            bail!("Android provider returned an invalid PDF descriptor");
        }
        // detachFd transfers ownership of the descriptor to Rust.
        Ok((
            unsafe { File::from_raw_fd(fd) },
            offset,
            u64::try_from(length).ok(),
        ))
    })();
    if opened.is_err() {
        env.exception_clear()?;
        let _ = env.call_method(&asset, "close", "()V", &[]);
    }
    opened
}
