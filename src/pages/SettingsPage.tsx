import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { Cpu, Download, Spinner, Puzzle, Save, Wrench, Settings, ShieldCheck } from "@/components/icons";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { ThemePicker } from "@/components/ThemePicker";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { AppUpdateCard } from "./settings/AppUpdateCard";
import { DataPrivacyPanel } from "./settings/DataPrivacyPanel";
import { ExportPanel } from "./settings/ExportPanel";
import { PluginsPanel } from "./settings/PluginsPanel";
import { ProfilesTab } from "./settings/ProfilesTab";
import { TopicAlertsPanel } from "./settings/TopicAlertsPanel";

type SettingsTab = "privacy" | "plugins" | "profiles" | "export" | "tools";

const TAB_DEFS: { key: SettingsTab; labelKey: TKey; icon: typeof Cpu }[] = [
  { key: "privacy", labelKey: "settings.tab.privacy", icon: ShieldCheck },
  { key: "plugins", labelKey: "settings.tab.plugins", icon: Puzzle },
  { key: "profiles", labelKey: "settings.tab.profiles", icon: Cpu },
  { key: "export", labelKey: "export.title", icon: Download },
  { key: "tools", labelKey: "settings.tab.tools", icon: Wrench },
];
const DESKTOP_TABS = "(width > 900px)";

function settingsTabFrom(value: string | null): SettingsTab {
  return TAB_DEFS.find((tab) => tab.key === value)?.key ?? "profiles";
}

export function SettingsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => settingsTabFrom(params.get("tab")));
  const [verticalTabs, setVerticalTabs] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP_TABS).matches);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_TABS);
    const update = () => setVerticalTabs(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!verticalTabs) {
      activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [tab, verticalTabs]);
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
  const showsSave = tab === "profiles" || tab === "tools";
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
        icon={<Settings />}
        title={t("settings.title")}
        subtitle={saveState && (
          <span className={save.error ? "text-litera-error" : save.isSuccess && !isDirty ? "text-litera-success" : undefined} role="status">
            {saveState}
          </span>
        )}
        actions={showsSave && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => save.mutate(draft)}
            disabled={save.isPending || !isDirty}
          >
            {save.isPending ? <Spinner className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("common.save")}
          </Button>
        )}
      />

      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(settingsTabFrom(value))}
        orientation={verticalTabs ? "vertical" : "horizontal"}
        className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col"
      >
        <div className="litera-settings-nav w-48 shrink-0 overflow-y-auto border-r border-litera-border px-3 py-4 max-[900px]:max-h-[45%] max-[900px]:w-full max-[900px]:border-b max-[900px]:border-r-0 max-[900px]:px-[var(--litera-page-inset)] max-[900px]:py-2">
          <Tabs.List
            className="litera-tab-list w-full flex-col items-stretch max-[900px]:flex-row max-[900px]:flex-wrap"
            aria-label={t("settings.title")}
          >
            {TAB_DEFS.map(({ key, labelKey, icon: Icon }) => (
              <Tabs.Trigger
                key={key}
                ref={key === tab ? activeTabRef : undefined}
                value={key}
                className="litera-tab min-h-9 justify-start"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(labelKey)}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <div className="min-w-0 flex-1 overflow-auto px-[var(--litera-page-inset)] py-4">
          <div className="mx-auto w-full max-w-5xl">
            <Tabs.Content value="privacy" className="litera-tab-panel space-y-4">
              <DataPrivacyPanel />
              <AppUpdateCard />
            </Tabs.Content>
            <Tabs.Content value="plugins" className="litera-tab-panel"><PluginsPanel /></Tabs.Content>
            <Tabs.Content value="profiles" className="litera-tab-panel space-y-4">
              <ProfilesTab
                draft={draft}
                isLoading={isLoading}
                activeMissing={activeMissing}
                onUpsert={upsert}
                onRemove={remove}
                onSetActive={(name) => setDraft((current) => ({ ...current, active: name }))}
                onUpdateTaskAssignments={(assignments) => setDraft((current) => ({ ...current, task_assignments: assignments }))}
              />
              {save.error && <div role="alert" className="text-sm text-litera-error">{save.error.message}</div>}
            </Tabs.Content>
            <Tabs.Content value="export" className="litera-tab-panel"><ExportPanel /></Tabs.Content>
            <Tabs.Content value="tools" className="litera-tab-panel space-y-4">
              <section className="litera-panel p-4">
                <ThemePicker />
              </section>
              <TopicAlertsPanel />
              {save.error && <div role="alert" className="text-sm text-litera-error">{save.error.message}</div>}
            </Tabs.Content>
          </div>
        </div>
      </Tabs.Root>
    </section>
  );
}
