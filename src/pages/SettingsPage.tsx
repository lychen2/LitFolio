import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Cpu, Download, FolderSync, Loader2, Save, Search, ShieldCheck, Workflow } from "lucide-react";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";
import { TabButton } from "@/components/TabButton";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { CustomFieldsManager } from "./settings/CustomFieldsManager";
import { AppUpdateCard } from "./settings/AppUpdateCard";
import { DataPrivacyPanel } from "./settings/DataPrivacyPanel";
import { DuplicatesPanel } from "./settings/DuplicatesPanel";
import { ExportPanel } from "./settings/ExportPanel";
import { ProfilesTab } from "./settings/ProfilesTab";
import { SyncPanel } from "./settings/SyncPanel";
import { TaskAssignments } from "./settings/TaskAssignments";
import { PdfMarkdownSettings } from "./settings/PdfMarkdownSettings";
import { TopicAlertsPanel } from "./settings/TopicAlertsPanel";

type SettingsTab = "privacy" | "profiles" | "tasks" | "sync" | "export" | "tools";

const TAB_DEFS: { key: SettingsTab; labelKey: TKey; icon: typeof Cpu }[] = [
  { key: "privacy", labelKey: "settings.tab.privacy", icon: ShieldCheck },
  { key: "profiles", labelKey: "settings.tab.profiles", icon: Cpu },
  { key: "tasks", labelKey: "settings.tab.tasks", icon: Workflow },
  { key: "sync", labelKey: "settings.tab.sync", icon: FolderSync },
  { key: "export", labelKey: "export.title", icon: Download },
  { key: "tools", labelKey: "settings.tab.tools", icon: Search },
];

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>("privacy");
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
  });
  const [draft, setDraft] = useState<LlmConfig>({
    profiles: [],
    active: null,
    output_language: "Chinese",
    pdf_markdown: { engine: "local", mineru_token: "" },
    task_assignments: {
      tldr: null,
      quick_read: null,
      translate: null,
      tag: null,
      link: null,
      topic_survey: null,
      ask: null,
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

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-litera-mute">{t("settings.subtitle")}</p>
        </div>
        <button
          onClick={() => save.mutate(draft)}
          disabled={save.isPending}
          className="litera-btn-primary text-sm disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex gap-1 mb-6 border-b border-litera-line">
            {TAB_DEFS.map(({ key, labelKey, icon: Icon }) => (
              <TabButton
                key={key}
                active={tab === key}
                onClick={() => setTab(key)}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={t(labelKey)}
              />
            ))}
          </div>

          {tab === "privacy" && (
            <div className="space-y-5">
              <DataPrivacyPanel />
              <AppUpdateCard />
            </div>
          )}
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
          {tab === "tasks" && <TaskAssignments draft={draft} onChange={setDraft} />}
          {tab === "sync" && <SyncPanel />}
          {tab === "export" && <ExportPanel />}
          {tab === "tools" && (
            <div className="space-y-8">
              <PdfMarkdownSettings draft={draft} onChange={setDraft} />
              <TopicAlertsPanel />
              <DuplicatesPanel />
              <CustomFieldsManager />
            </div>
          )}

          {save.error && <div className="text-sm text-red-400/90 mt-3">✕ {(save.error as Error).message}</div>}
          {save.isSuccess && <div className="text-sm text-litera-accent mt-3">{t("settings.saved")}</div>}
        </div>
      </div>
    </section>
  );
}
