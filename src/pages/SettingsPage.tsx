import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Cpu, Download, FolderSync, Loader2, Puzzle, Save, Search, ShieldCheck } from "lucide-react";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { ThemePicker } from "@/components/ThemePicker";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { CustomFieldsManager } from "./settings/CustomFieldsManager";
import { AppUpdateCard } from "./settings/AppUpdateCard";
import { DataPrivacyPanel } from "./settings/DataPrivacyPanel";
import { DuplicatesPanel } from "./settings/DuplicatesPanel";
import { ExportPanel } from "./settings/ExportPanel";
import { PluginsPanel } from "./settings/PluginsPanel";
import { ProfilesTab } from "./settings/ProfilesTab";
import { SyncPanel } from "./settings/SyncPanel";
import { ZoteroPanel } from "./settings/ZoteroPanel";
import { PdfMarkdownSettings } from "./settings/PdfMarkdownSettings";
import { ObsidianSettings } from "./settings/ObsidianSettings";
import { TopicAlertsPanel } from "./settings/TopicAlertsPanel";

type SettingsTab = "privacy" | "plugins" | "profiles" | "sync" | "export" | "tools";

const TAB_DEFS: { key: SettingsTab; labelKey: TKey; icon: typeof Cpu }[] = [
  { key: "privacy", labelKey: "settings.tab.privacy", icon: ShieldCheck },
  { key: "plugins", labelKey: "settings.tab.plugins", icon: Puzzle },
  { key: "profiles", labelKey: "settings.tab.profiles", icon: Cpu },
  { key: "sync", labelKey: "settings.tab.sync", icon: FolderSync },
  { key: "export", labelKey: "export.title", icon: Download },
  { key: "tools", labelKey: "settings.tab.tools", icon: Search },
];

function settingsTabFrom(value: string | null): SettingsTab {
  return TAB_DEFS.some((tab) => tab.key === value) ? (value as SettingsTab) : "privacy";
}

export function SettingsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => settingsTabFrom(params.get("tab")));
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
  });
  const [draft, setDraft] = useState<LlmConfig>({
    profiles: [],
    active: null,
    output_language: "Chinese",
    pdf_markdown: { engine: "local", mineru_token: "" },
    obsidian: { vault_dir: "", folder: "Papers" },
    task_assignments: {
      tldr: null,
      quick_read: null,
      translate: null,
      tag: null,
      link: null,
      topic_survey: null,
      ask: null,
      lit_review: null,
    },
  });
  useEffect(() => { if (data) setDraft(data); }, [data]);

  const save = useMutation({
    mutationFn: (config: LlmConfig) => api.llmSaveConfig(config),
    onSuccess: () => refetch(),
  });

  function upsert(profile: LlmProfile, originalName?: string) {
    setDraft((current) => {
      const profiles = current.profiles.filter((p) => p.name !== (originalName ?? profile.name));
      profiles.push(profile);
      const active = current.active === originalName ? profile.name : (current.active ?? profile.name);
      return { ...current, profiles, active };
    });
  }

  function remove(name: string) {
    setDraft((current) => ({
      ...current,
      profiles: current.profiles.filter((p) => p.name !== name),
      active: current.active === name ? null : current.active,
      task_assignments: Object.fromEntries(
        Object.entries(current.task_assignments).map(([key, value]) => [
          key,
          value?.profile === name ? null : value,
        ]),
      ) as LlmConfig["task_assignments"],
    }));
  }

  const activeMissing = !!(draft.active && !draft.profiles.some((p) => p.name === draft.active));
  const isDirty = !!data && JSON.stringify(draft) !== JSON.stringify(data);
  const saveState = save.isPending
    ? t("settings.saving")
    : save.error
      ? t("settings.saveFailed")
      : save.isSuccess && !isDirty
        ? t("settings.saved")
        : isDirty
          ? t("settings.unsaved")
          : null;

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        actions={(
          <>
            {saveState && (
              <span className={`text-xs ${save.error ? "text-litera-error" : save.isSuccess && !isDirty ? "text-litera-success" : "text-litera-mute"}`} role="status">
                {saveState}
              </span>
            )}
            <button
              onClick={() => save.mutate(draft)}
              disabled={save.isPending || !isDirty}
              className="litera-btn-primary text-sm disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </>
        )}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        <nav className="w-48 shrink-0 overflow-y-auto border-r border-litera-border bg-litera-paper/35 px-3 py-4 max-[900px]:w-full max-[900px]:shrink-0 max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:py-2" aria-label={t("settings.title")} role="tablist">
          <div className="space-y-1 max-[900px]:flex max-[900px]:w-max max-[900px]:gap-1">
            {TAB_DEFS.map(({ key, labelKey, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  role="tab"
                  aria-selected={active}
                  className={
                    "flex min-h-9 w-full items-center gap-2 rounded-[var(--litera-radius)] px-2.5 text-left text-sm transition-colors max-[900px]:w-auto max-[900px]:whitespace-nowrap " +
                    (active
                      ? "bg-litera-accent/12 text-litera-accent"
                      : "text-litera-mute hover:bg-litera-surface2 hover:text-litera-text")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-auto px-6 py-6 max-[900px]:px-4 max-[900px]:py-4">
          <div className="mx-auto max-w-5xl space-y-5">
            {tab === "privacy" && (
              <div className="space-y-5">
                <DataPrivacyPanel />
                <AppUpdateCard />
              </div>
            )}
            {tab === "plugins" && <PluginsPanel />}
            {tab === "profiles" && (
              <ProfilesTab
                draft={draft}
                isLoading={isLoading}
                activeMissing={activeMissing}
                onUpsert={upsert}
                onRemove={remove}
                onSetActive={(name) => setDraft((current) => ({ ...current, active: name }))}
              />
            )}
            {tab === "sync" && (
              <div className="space-y-5">
                <SyncPanel />
                <ZoteroPanel />
              </div>
            )}
            {tab === "export" && <ExportPanel />}
            {tab === "tools" && (
              <div className="space-y-6">
                <section className="border-b border-litera-border pb-6">
                  <ThemePicker />
                </section>
                <PdfMarkdownSettings draft={draft} onChange={setDraft} />
                <ObsidianSettings draft={draft} onChange={setDraft} />
                <TopicAlertsPanel />
                <DuplicatesPanel />
                <CustomFieldsManager />
              </div>
            )}

            {save.error && <div className="text-sm text-litera-error">✕ {(save.error as Error).message}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
