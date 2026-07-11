import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Cloud,
  Download,
  Eye,
  EyeOff,
  FolderSync,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  EMPTY_SYNC_CONFIG,
  syncApi,
  type SyncConfig,
  type SyncPreviewAction,
  type SyncPreviewReport,
  type SyncReport,
} from "@/lib/syncApi";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import type { I18nVars } from "@/i18n/format";
import { errorMessageOr } from "@/lib/error";
import {
  createSyncLastResult,
  summarizeSyncConfig,
  type SyncLastResult,
  type SyncLastResultKind,
} from "./syncPanelState";

const PREVIEW_CHANGE_LIMIT = 20;

type Translate = (key: TKey, vars?: I18nVars) => string;

export function SyncPanel() {
  const t = useT();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sync", "config"],
    queryFn: syncApi.getConfig,
  });
  const { data: libraryRoot } = useQuery({
    queryKey: ["library-root"],
    queryFn: api.libraryRoot,
  });
  const [draft, setDraft] = useState<SyncConfig>(EMPTY_SYNC_CONFIG);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmingPull, setConfirmingPull] = useState(false);
  const [preview, setPreview] = useState<SyncPreviewReport | null>(null);
  const [lastResult, setLastResult] = useState<SyncLastResult | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const rememberResult = (
    kind: SyncLastResultKind,
    status: SyncLastResult["status"],
    message: string
  ) => {
    setLastResult(createSyncLastResult(kind, status, message, new Date()));
  };

  const save = useMutation({
    mutationFn: (config: SyncConfig) => syncApi.saveConfig(config),
    onSuccess: () => {
      rememberResult("save", "success", t("settings.sync.saved"));
      void refetch();
    },
    onError: (error) => rememberResult("save", "error", syncErrorMessage(error)),
  });
  const test = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.test();
    },
    onSuccess: (result) => {
      rememberResult("test", "success", t("settings.sync.testOk", { remote: result.remote_root }));
      void refetch();
    },
    onError: (error) => rememberResult("test", "error", syncErrorMessage(error)),
  });
  const previewPush = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.previewPushLibrary();
    },
    onSuccess: (report) => {
      setPreview(report);
      rememberResult("preview_push", "success", previewResultMessage(t, "settings.sync.previewPushTitle", report));
      void refetch();
    },
    onError: (error) => rememberResult("preview_push", "error", syncErrorMessage(error)),
  });
  const previewPull = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.previewPullLibrary();
    },
    onSuccess: (report) => {
      setPreview(report);
      rememberResult("preview_pull", "success", previewResultMessage(t, "settings.sync.previewPullTitle", report));
      void refetch();
    },
    onError: (error) => rememberResult("preview_pull", "error", syncErrorMessage(error)),
  });
  const push = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.pushLibrary();
    },
    onSuccess: (report) => {
      setPreview(null);
      rememberResult("push", "success", reportMessage(t, "settings.sync.pushOk", report));
      void refetch();
    },
    onError: (error) => rememberResult("push", "error", syncErrorMessage(error)),
  });
  const pull = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.pullLibrary();
    },
    onSuccess: (report) => {
      setPreview(null);
      rememberResult("pull", "success", reportMessage(t, "settings.sync.pullOk", report));
      void refetch();
    },
    onError: (error) => rememberResult("pull", "error", syncErrorMessage(error)),
  });

  const busy =
    save.isPending ||
    test.isPending ||
    previewPush.isPending ||
    previewPull.isPending ||
    push.isPending ||
    pull.isPending;
  const isReady =
    draft.webdav.base_url.trim() !== "" &&
    draft.webdav.remote_path.trim() !== "";
  const configSummary = summarizeSyncConfig(draft);

  function setField<K extends keyof SyncConfig["webdav"]>(
    key: K,
    value: SyncConfig["webdav"][K]
  ) {
    setPreview(null);
    setDraft((current) => ({
      ...current,
      webdav: { ...current.webdav, [key]: value },
    }));
  }

  return (
    <section className="litera-panel p-5 mt-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-litera-text font-medium mb-1 flex items-center gap-2">
            <FolderSync className="h-4 w-4 text-litera-accent2" />{" "}
            {t("settings.sync.title")}
          </h2>
          <p className="text-xs text-litera-mute">{t("settings.sync.hint")}</p>
        </div>
        <div className="rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-2 text-xs text-litera-mute md:max-w-xs">
          <div className="mb-1 flex items-center gap-2 text-litera-text">
            <Cloud className="h-3.5 w-3.5 text-litera-accent" />{" "}
            {t("settings.sync.localRoot")}
          </div>
          <div className="font-mono break-all">{libraryRoot ?? "…"}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 text-sm text-litera-mute">
          {t("common.loading")}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Field label={t("settings.sync.baseUrl")}>
              <input
                value={draft.webdav.base_url}
                onChange={(e) => setField("base_url", e.target.value)}
                className="litera-input w-full font-mono text-xs"
                placeholder="https://dav.example.com/remote.php/dav/files/alice"
              />
            </Field>
            <Field label={t("settings.sync.remotePath")}>
              <input
                value={draft.webdav.remote_path}
                onChange={(e) => setField("remote_path", e.target.value)}
                className="litera-input w-full font-mono text-xs"
                placeholder="litfolio/main"
              />
            </Field>
            <Field label={t("settings.sync.username")}>
              <input
                value={draft.webdav.username}
                onChange={(e) => setField("username", e.target.value)}
                className="litera-input w-full text-sm"
                placeholder={t("settings.sync.usernamePlaceholder")}
              />
            </Field>
            <Field label={t("settings.sync.password")}>
              <div className="relative">
                <input
                  value={draft.webdav.password}
                  onChange={(e) => setField("password", e.target.value)}
                  type={showPassword ? "text" : "password"}
                  className="litera-input w-full pr-9 text-sm"
                  placeholder={t("settings.sync.passwordPlaceholder")}
                />
                <button
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute"
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </Field>
          </div>

          <SyncStatusSummary
            summary={configSummary}
            lastResult={lastResult}
            t={t}
          />

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => save.mutate(draft)}
              disabled={busy}
              className="litera-btn disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("settings.sync.save")}
            </button>
            <button
              onClick={() => test.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {test.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              {t("settings.sync.test")}
            </button>
            <button
              onClick={() => previewPush.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {previewPush.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("settings.sync.previewPush")}
            </button>
            <button
              onClick={() => previewPull.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {previewPull.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t("settings.sync.previewPull")}
            </button>
            <button
              onClick={() => push.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {push.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("settings.sync.push")}
            </button>
            {confirmingPull ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-red-400/90">
                  {t("settings.sync.pullConfirmInline")}
                </span>
                <button
                  onClick={() => {
                    pull.mutate(draft);
                    setConfirmingPull(false);
                  }}
                  disabled={busy}
                  className="litera-btn-primary text-xs px-2 py-1"
                >
                  {t("settings.profile.confirm")}
                </button>
                <button
                  onClick={() => setConfirmingPull(false)}
                  className="litera-btn text-xs px-2 py-1"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingPull(true)}
                disabled={busy || !isReady}
                className="litera-btn disabled:opacity-50"
              >
                {pull.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t("settings.sync.pull")}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-[var(--litera-radius)] border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/85">
            {t("settings.sync.warning")}
          </div>

          {preview && <SyncPreviewPanel preview={preview} t={t} />}

          {save.error && <ErrorText message={syncErrorMessage(save.error)} />}
          {test.error && <ErrorText message={syncErrorMessage(test.error)} />}
          {previewPush.error && (
            <ErrorText message={syncErrorMessage(previewPush.error)} />
          )}
          {previewPull.error && (
            <ErrorText message={syncErrorMessage(previewPull.error)} />
          )}
          {push.error && <ErrorText message={syncErrorMessage(push.error)} />}
          {pull.error && <ErrorText message={syncErrorMessage(pull.error)} />}

          {save.isSuccess && <InfoText message={t("settings.sync.saved")} />}
          {test.isSuccess && (
            <InfoText
              message={t("settings.sync.testOk", {
                remote: test.data.remote_root,
              })}
            />
          )}
          {push.isSuccess && (
            <InfoText
              message={reportMessage(t, "settings.sync.pushOk", push.data)}
            />
          )}
          {pull.isSuccess && (
            <InfoText
              message={reportMessage(t, "settings.sync.pullOk", pull.data)}
            />
          )}
        </>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-litera-mute">
        {label}
      </span>
      {children}
    </label>
  );
}

function ErrorText({ message }: { message: string }) {
  return <div className="mt-3 text-sm text-red-400/90">✕ {message}</div>;
}

function InfoText({ message }: { message: string }) {
  return <div className="mt-3 text-sm text-litera-accent">{message}</div>;
}

function SyncStatusSummary({
  summary,
  lastResult,
  t,
}: {
  summary: ReturnType<typeof summarizeSyncConfig>;
  lastResult: SyncLastResult | null;
  t: Translate;
}) {
  return (
    <div className="mt-4 grid gap-2 rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-2 text-xs text-litera-mute md:grid-cols-2">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-litera-mute">
          {t("settings.sync.currentConfig")}
        </div>
        <div className="mt-1 break-all font-mono text-litera-text">
          {summary.configured ? summary.remote : t("settings.sync.notConfigured")}
        </div>
        <div className="mt-1">
          {summary.authMode === "authenticated"
            ? t("settings.sync.authUser", { username: summary.username })
            : t("settings.sync.authAnonymous")}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-litera-mute">
          {t("settings.sync.lastResult")}
        </div>
        {lastResult ? (
          <div className={lastResult.status === "success" ? "mt-1 text-litera-accent" : "mt-1 text-red-400/90"}>
            <span className="font-medium">{t(syncLastResultKindKey(lastResult.kind))}</span>
            <span className="text-litera-mute"> · {new Date(lastResult.at).toLocaleString()}</span>
            <div className="mt-0.5 break-words">{lastResult.message}</div>
          </div>
        ) : (
          <div className="mt-1">{t("settings.sync.lastResultNone")}</div>
        )}
      </div>
    </div>
  );
}

function SyncPreviewPanel({
  preview,
  t,
}: {
  preview: SyncPreviewReport;
  t: Translate;
}) {
  const visibleChanges = preview.changes.slice(0, PREVIEW_CHANGE_LIMIT);
  const hiddenCount = Math.max(
    0,
    preview.changes.length - visibleChanges.length
  );
  const titleKey =
    preview.direction === "push"
      ? "settings.sync.previewPushTitle"
      : "settings.sync.previewPullTitle";

  return (
    <div className="mt-4 rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-3 text-xs text-litera-mute">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-medium text-litera-text">
            {t(titleKey)}
          </h3>
          <p className="mt-1 text-litera-mute">
            {t("settings.sync.previewHint")}
          </p>
        </div>
        <div className="font-mono text-[11px] text-litera-mute md:max-w-xs md:text-right">
          {t("settings.sync.previewRemote", { remote: preview.remote_root })}
        </div>
      </div>

      <p className="mt-3 text-litera-text">
        {t("settings.sync.previewSummary", {
          add: preview.add_count,
          update: preview.update_count,
          delete: preview.delete_count,
          unchanged: preview.unchanged_count,
          size: formatBytes(preview.transfer_bytes),
        })}
      </p>

      {(preview.restart_required || preview.backup_path) && (
        <div className="mt-3 flex flex-col gap-1 rounded-[var(--litera-radius)] border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-amber-100/85">
          {preview.restart_required && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{t("settings.sync.previewRestartRequired")}</span>
            </div>
          )}
          {preview.backup_path && (
            <div className="font-mono text-[11px]">
              {t("settings.sync.previewBackup", {
                backupPath: preview.backup_path,
              })}
            </div>
          )}
        </div>
      )}

      {visibleChanges.length === 0 ? (
        <div className="mt-3 text-litera-mute">
          {t("settings.sync.previewNoChanges")}
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-litera-mute">
            {t("settings.sync.previewChanges")}
          </div>
          <ul className="max-h-72 space-y-1 overflow-auto pr-1">
            {visibleChanges.map((change) => (
              <li
                key={`${change.action}:${change.path}`}
                className="grid gap-2 rounded-[var(--litera-radius)] border border-litera-line/80 bg-litera-panel/40 px-2.5 py-2 md:grid-cols-[8rem_minmax(0,1fr)_5rem]"
              >
                <span className="text-litera-accent">
                  {t(syncPreviewActionKey(change.action))}
                </span>
                <span className="min-w-0 break-all font-mono text-[11px] text-litera-text">
                  {change.path}
                </span>
                <span className="font-mono text-[11px] text-litera-mute md:text-right">
                  {formatBytes(change.size)}
                </span>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <div className="mt-2 text-litera-mute">
              {t("settings.sync.previewMore", { count: hiddenCount })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function reportMessage(
  t: (
    key: "settings.sync.pushOk" | "settings.sync.pullOk",
    vars?: Record<string, string | number>
  ) => string,
  key: "settings.sync.pushOk" | "settings.sync.pullOk",
  report: SyncReport
): string {
  return t(key, {
    count: report.file_count,
    size: formatBytes(report.total_bytes),
    skippedCount: report.skipped_count,
    remote: report.remote_root,
  });
}

function previewResultMessage(
  t: Translate,
  titleKey: "settings.sync.previewPushTitle" | "settings.sync.previewPullTitle",
  report: SyncPreviewReport
): string {
  return `${t(titleKey)} · ${t("settings.sync.previewSummary", {
    add: report.add_count,
    update: report.update_count,
    delete: report.delete_count,
    unchanged: report.unchanged_count,
    size: formatBytes(report.transfer_bytes),
  })}`;
}

function syncLastResultKindKey(kind: SyncLastResultKind): TKey {
  switch (kind) {
    case "save":
      return "settings.sync.lastKind.save";
    case "test":
      return "settings.sync.lastKind.test";
    case "preview_push":
      return "settings.sync.lastKind.previewPush";
    case "preview_pull":
      return "settings.sync.lastKind.previewPull";
    case "push":
      return "settings.sync.lastKind.push";
    case "pull":
      return "settings.sync.lastKind.pull";
  }
}

function syncPreviewActionKey(action: SyncPreviewAction): TKey {
  switch (action) {
    case "upload_new":
      return "settings.sync.previewAction.uploadNew";
    case "upload_replace":
      return "settings.sync.previewAction.uploadReplace";
    case "delete_remote":
      return "settings.sync.previewAction.deleteRemote";
    case "download_new":
      return "settings.sync.previewAction.downloadNew";
    case "download_replace":
      return "settings.sync.previewAction.downloadReplace";
    case "delete_local":
      return "settings.sync.previewAction.deleteLocal";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function syncErrorMessage(error: unknown): string {
  return errorMessageOr(error, "Unknown sync error");
}
