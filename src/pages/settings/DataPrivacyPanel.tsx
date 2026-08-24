import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  BrainCircuit, Cloud, Database, Download, ExternalLink, Globe2, HardDrive, KeyRound, Loader2, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { api, type LlmConfig } from "@/lib/api";
import { syncApi } from "@/lib/syncApi";
import { useT } from "@/i18n/I18nProvider";

const NETWORK_FEATURES = [
  "settings.privacy.network.llm",
  "settings.privacy.network.semanticScholar",
  "settings.privacy.network.arxiv",
  "settings.privacy.network.rss",
  "settings.privacy.network.sync",
] as const;

const AI_DATA_ITEMS = [
  "settings.privacy.ai.translate",
  "settings.privacy.ai.summary",
  "settings.privacy.ai.ask",
  "settings.privacy.ai.survey",
  "settings.privacy.ai.discovery",
] as const;

export function DataPrivacyPanel() {
  const t = useT();
  const [openError, setOpenError] = useState<string | null>(null);
  const [diagnosticsResult, setDiagnosticsResult] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsExporting, setDiagnosticsExporting] = useState(false);
  const root = useQuery({ queryKey: ["library-root"], queryFn: api.libraryRoot });
  const llm = useQuery({ queryKey: ["llm", "config"], queryFn: api.llmGetConfig });
  const sync = useQuery({ queryKey: ["sync", "config"], queryFn: syncApi.getConfig });
  const config = llm.data;
  const activeProfile = activeLlmProfile(config);
  const syncConfigured = !!sync.data?.webdav.base_url.trim();

  async function openLibraryRoot() {
    if (!root.data) return;
    setOpenError(null);
    try {
      await revealItemInDir(root.data);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportDiagnosticsLog() {
    setDiagnosticsError(null);
    setDiagnosticsResult(null);
    setDiagnosticsExporting(true);
    try {
      const destPath = await save({
        defaultPath: "litfolio-diagnostics.log",
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (!destPath) return;
      const exportedPath = await api.diagnosticsExportLog(destPath);
      setDiagnosticsResult(t("settings.privacy.exportDiagnosticsDone", { path: exportedPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDiagnosticsError(t("settings.privacy.exportDiagnosticsFailed", { message }));
    } finally {
      setDiagnosticsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="litera-panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-litera-text font-medium mb-1 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-litera-accent2" />
              {t("settings.privacy.title")}
            </h2>
            <p className="text-xs text-litera-mute">{t("settings.privacy.subtitle")}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <button
              onClick={openLibraryRoot}
              disabled={!root.data}
              className="litera-btn text-xs disabled:opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("settings.privacy.openDataDir")}
            </button>
            <button
              onClick={exportDiagnosticsLog}
              disabled={diagnosticsExporting}
              title={t("settings.privacy.exportDiagnosticsTitle")}
              className="litera-btn text-xs disabled:opacity-50"
            >
              {diagnosticsExporting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              {t("settings.privacy.exportDiagnostics")}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Fact icon={HardDrive} label={t("settings.privacy.storageLocation")}>
            {root.isLoading ? t("common.loading") : <span className="font-mono break-all">{root.data}</span>}
          </Fact>
          <Fact icon={KeyRound} label={t("settings.privacy.activeEndpoint")}>
            {llm.isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : endpointText(activeProfile, t("settings.privacy.noActiveProfile"))}
          </Fact>
          <Fact icon={Database} label={t("settings.privacy.activeProfile")}>
            {activeProfile?.name ?? t("settings.privacy.noActiveProfile")}
          </Fact>
          <Fact icon={Cloud} label={t("settings.privacy.syncStatus")}>
            {syncConfigured ? t("settings.privacy.syncConfigured") : t("settings.privacy.syncNotConfigured")}
          </Fact>
        </div>
        {openError && <div className="mt-3 text-xs text-litera-error">✕ {openError}</div>}
        {diagnosticsError && <div className="mt-3 text-xs text-litera-error">✕ {diagnosticsError}</div>}
        {diagnosticsResult && <div className="mt-3 text-xs text-litera-accent">{diagnosticsResult}</div>}
      </section>

      <section className="litera-panel p-5">
        <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-3">
          {t("settings.privacy.networkTitle")}
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {NETWORK_FEATURES.map((key) => (
            <div key={key} className="flex items-start gap-2 text-sm text-litera-text">
              <Globe2 className="h-3.5 w-3.5 mt-0.5 text-litera-mute shrink-0" />
              <span>{t(key)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="litera-panel p-5">
        <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-3">
          {t("settings.privacy.aiDataTitle")}
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {AI_DATA_ITEMS.map((key) => (
            <div key={key} className="flex items-start gap-2 text-sm text-litera-text">
              <BrainCircuit className="h-3.5 w-3.5 mt-0.5 text-litera-mute shrink-0" />
              <span>{t(key)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="litera-panel p-5">
        <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-3">
          {t("settings.privacy.taskBindings")}
        </h3>
        <TaskBindingList config={config} />
      </section>
    </div>
  );
}

function Fact({
  icon: Icon, label, children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-litera-mute">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-litera-text">{children}</div>
    </div>
  );
}

function activeLlmProfile(config?: LlmConfig) {
  if (!config) return null;
  return config.profiles.find((profile) => profile.name === config.active) ?? config.profiles[0] ?? null;
}

function endpointText(profile: ReturnType<typeof activeLlmProfile>, emptyText: string) {
  if (!profile) return emptyText;
  return `${profile.base_url} · ${profile.chat_model}`;
}

function TaskBindingList({ config }: { config?: LlmConfig }) {
  const t = useT();
  if (!config) return <div className="text-sm text-litera-mute">{t("common.loading")}</div>;
  const rows = Object.entries(config.task_assignments);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {rows.map(([task, binding]) => (
        <div key={task} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-litera-mute">{task.replaceAll("_", " ")}</span>
          <span className="font-mono text-xs text-litera-text">
            {binding ? `${binding.profile} / ${binding.model}` : t("settings.privacy.defaultBinding")}
          </span>
        </div>
      ))}
      <div className="md:col-span-2 text-xs text-litera-mute">
        {t("settings.privacy.lastSyncNotTracked")}
      </div>
    </div>
  );
}
