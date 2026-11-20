import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  BrainCircuit, Database, Download, ExternalLink, Globe2, HardDrive, KeyRound, Spinner, ShieldCheck,
  type AppIcon,
  XCircle,
} from "@/components/icons";
import { Button } from "@/components/ui";
import { api, type LlmConfig } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const NETWORK_FEATURES = [
  "settings.privacy.network.llm",
  "settings.privacy.network.semanticScholar",
  "settings.privacy.network.arxiv",
  "settings.privacy.network.rss",
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
  const config = llm.data;
  const activeProfile = activeLlmProfile(config);

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
    <div className="space-y-4">
      <section className="litera-panel p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-litera-text font-medium mb-1 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-litera-accent2" />
              {t("settings.privacy.title")}
            </h2>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button
              size="sm"
              onClick={openLibraryRoot}
              disabled={!root.data}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("settings.privacy.openDataDir")}
            </Button>
            <Button
              size="sm"
              onClick={exportDiagnosticsLog}
              disabled={diagnosticsExporting}
              title={t("settings.privacy.exportDiagnosticsTitle")}
            >
              {diagnosticsExporting
                ? <Spinner className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              {t("settings.privacy.exportDiagnostics")}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Fact icon={HardDrive} label={t("settings.privacy.storageLocation")}>
            {root.isLoading ? t("common.loading") : <span className="font-mono break-all">{root.data}</span>}
          </Fact>
          <Fact icon={KeyRound} label={t("settings.privacy.activeEndpoint")}>
            {llm.isLoading
              ? <Spinner className="h-3.5 w-3.5 animate-spin" />
              : endpointText(activeProfile, t("settings.privacy.noActiveProfile"))}
          </Fact>
          <Fact icon={Database} label={t("settings.privacy.activeProfile")}>
            {activeProfile?.name ?? t("settings.privacy.noActiveProfile")}
          </Fact>
        </div>
        {openError && <p role="alert" className="mt-3 text-xs text-litera-error"><XCircle className="mr-1 size-4 align-text-bottom" />{openError}</p>}
        {diagnosticsError && <p role="alert" className="mt-3 text-xs text-litera-error"><XCircle className="mr-1 size-4 align-text-bottom" />{diagnosticsError}</p>}
        {diagnosticsResult && <p role="status" className="mt-3 break-words text-xs text-litera-success">{diagnosticsResult}</p>}
      </section>

      <div className="litera-panel divide-y divide-litera-border">
        <details className="p-4">
          <summary className="cursor-pointer text-sm font-medium text-litera-text">
            {t("settings.privacy.networkTitle")}
          </summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {NETWORK_FEATURES.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-litera-text">
                <Globe2 className="size-4 shrink-0 text-litera-mute" aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </details>
        <details className="p-4">
          <summary className="cursor-pointer text-sm font-medium text-litera-text">
            {t("settings.privacy.aiDataTitle")}
          </summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {AI_DATA_ITEMS.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-litera-text">
                <BrainCircuit className="size-4 shrink-0 text-litera-mute" aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </details>
        <details className="p-4">
          <summary className="cursor-pointer text-sm font-medium text-litera-text">
            {t("settings.privacy.taskBindings")}
          </summary>
          <div className="mt-3"><TaskBindingList config={config} /></div>
        </details>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon, label, children,
}: {
  icon: AppIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--litera-radius)] border border-litera-border bg-litera-surface p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-litera-mute">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <div className="break-words text-sm text-litera-text">{children}</div>
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
          <span className="shrink-0 text-litera-mute">{task.replaceAll("_", " ")}</span>
          <span className="min-w-0 break-words text-right font-mono text-xs text-litera-text">
            {binding ? `${binding.profile} / ${binding.model}` : t("settings.privacy.defaultBinding")}
          </span>
        </div>
      ))}
    </div>
  );
}
