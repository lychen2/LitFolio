import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cloud, Download, Eye, EyeOff, FolderSync, Loader2, Save, Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { EMPTY_SYNC_CONFIG, syncApi, type SyncConfig, type SyncReport } from "@/lib/syncApi";
import { useT } from "@/i18n/I18nProvider";
import { errorMessageOr } from "@/lib/error";

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
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (config: SyncConfig) => syncApi.saveConfig(config),
    onSuccess: () => refetch(),
  });
  const test = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.test();
    },
    onSuccess: () => refetch(),
  });
  const push = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.pushLibrary();
    },
    onSuccess: () => refetch(),
  });
  const pull = useMutation({
    mutationFn: async (config: SyncConfig) => {
      await syncApi.saveConfig(config);
      return syncApi.pullLibrary();
    },
    onSuccess: () => refetch(),
  });

  const busy = save.isPending || test.isPending || push.isPending || pull.isPending;
  const isReady = draft.webdav.base_url.trim() !== "" && draft.webdav.remote_path.trim() !== "";

  function setField<K extends keyof SyncConfig["webdav"]>(key: K, value: SyncConfig["webdav"][K]) {
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
            <FolderSync className="h-4 w-4 text-litera-accent2" /> {t("settings.sync.title")}
          </h2>
          <p className="text-xs text-litera-mute">{t("settings.sync.hint")}</p>
        </div>
        <div className="rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-2 text-xs text-litera-mute md:max-w-xs">
          <div className="mb-1 flex items-center gap-2 text-litera-text">
            <Cloud className="h-3.5 w-3.5 text-litera-accent" /> {t("settings.sync.localRoot")}
          </div>
          <div className="font-mono break-all">{libraryRoot ?? "…"}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 text-sm text-litera-mute">{t("common.loading")}</div>
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
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => save.mutate(draft)}
              disabled={busy}
              className="litera-btn disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("settings.sync.save")}
            </button>
            <button
              onClick={() => test.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {t("settings.sync.test")}
            </button>
            <button
              onClick={() => push.mutate(draft)}
              disabled={busy || !isReady}
              className="litera-btn disabled:opacity-50"
            >
              {push.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("settings.sync.push")}
            </button>
            {confirmingPull ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-red-400/90">{t("settings.sync.pullConfirmInline")}</span>
                <button
                  onClick={() => { pull.mutate(draft); setConfirmingPull(false); }}
                  disabled={busy}
                  className="litera-btn-primary text-xs px-2 py-1"
                >
                  {t("settings.profile.confirm")}
                </button>
                <button onClick={() => setConfirmingPull(false)} className="litera-btn text-xs px-2 py-1">
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingPull(true)}
                disabled={busy || !isReady}
                className="litera-btn disabled:opacity-50"
              >
                {pull.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("settings.sync.pull")}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-[var(--litera-radius)] border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/85">
            {t("settings.sync.warning")}
          </div>

          {save.error && <ErrorText message={syncErrorMessage(save.error)} />}
          {test.error && <ErrorText message={syncErrorMessage(test.error)} />}
          {push.error && <ErrorText message={syncErrorMessage(push.error)} />}
          {pull.error && <ErrorText message={syncErrorMessage(pull.error)} />}

          {save.isSuccess && <InfoText message={t("settings.sync.saved")} />}
          {test.isSuccess && (
            <InfoText message={t("settings.sync.testOk", { remote: test.data.remote_root })} />
          )}
          {push.isSuccess && (
            <InfoText message={reportMessage(t, "settings.sync.pushOk", push.data)} />
          )}
          {pull.isSuccess && (
            <InfoText message={reportMessage(t, "settings.sync.pullOk", pull.data)} />
          )}
        </>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-litera-mute">{label}</span>
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

function reportMessage(
  t: (key: "settings.sync.pushOk" | "settings.sync.pullOk", vars?: Record<string, string | number>) => string,
  key: "settings.sync.pushOk" | "settings.sync.pullOk",
  report: SyncReport,
): string {
  return t(key, {
    count: report.file_count,
    size: formatBytes(report.total_bytes),
    remote: report.remote_root,
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function syncErrorMessage(error: unknown): string {
  return errorMessageOr(error, "Unknown sync error");
}
