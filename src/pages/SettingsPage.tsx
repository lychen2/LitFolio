import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Save, Loader2, KeyRound, Cpu, Workflow, FolderSync } from "lucide-react";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";
import { ProfileCard } from "./settings/ProfileCard";
import { SyncPanel } from "./settings/SyncPanel";
import { TaskAssignments } from "./settings/TaskAssignments";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";

type SettingsTab = "profiles" | "tasks" | "sync";

const TAB_DEFS: { key: SettingsTab; labelKey: TKey; icon: typeof Cpu }[] = [
  { key: "profiles", labelKey: "settings.tab.profiles", icon: Cpu },
  { key: "tasks", labelKey: "settings.tab.tasks", icon: Workflow },
  { key: "sync", labelKey: "settings.tab.sync", icon: FolderSync },
];

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "OpenAI",      profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek",    profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: null } },
  { label: "Moonshot",    profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: null } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Ollama",      profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "nomic-embed-text", api_key: "ollama" } },
];

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>("profiles");
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
  });
  const [draft, setDraft] = useState<LlmConfig>({
    profiles: [],
    active: null,
    output_language: "Chinese",
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
    mutationFn: (c: LlmConfig) => api.llmSaveConfig(c),
    onSuccess: () => refetch(),
  });

  function upsert(profile: LlmProfile, originalName?: string) {
    setDraft((d) => {
      const profiles = d.profiles.filter((p) => p.name !== (originalName ?? profile.name));
      profiles.push(profile);
      const active = d.active === originalName ? profile.name : (d.active ?? profile.name);
      return { ...d, profiles, active };
    });
  }
  function remove(name: string) {
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.filter((p) => p.name !== name),
      active: d.active === name ? null : d.active,
      task_assignments: Object.fromEntries(
        Object.entries(d.task_assignments).map(([k, v]) => [k, v?.profile === name ? null : v])
      ) as LlmConfig["task_assignments"],
    }));
  }
  function setActive(name: string) {
    setDraft((d) => ({ ...d, active: name }));
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
          className="litera-btn-primary disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </header>

      <nav className="px-6 pt-4 flex gap-1">
        {TAB_DEFS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors " +
              (tab === key
                ? "border-litera-accent/40 bg-litera-accent/10 text-litera-accent"
                : "border-litera-line text-litera-text/80 hover:bg-litera-panel")
            }
          >
            <Icon className="h-3.5 w-3.5" /> {t(labelKey)}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-6 max-w-4xl">
        {tab === "profiles" && (
          <ProfilesTab
            draft={draft}
            isLoading={isLoading}
            activeMissing={activeMissing}
            onUpsert={upsert}
            onRemove={remove}
            onSetActive={setActive}
          />
        )}
        {tab === "tasks" && <TaskAssignments draft={draft} onChange={setDraft} />}
        {tab === "sync" && <SyncPanel />}

        {save.error && <div className="text-sm text-red-400/90 mt-3">✕ {(save.error as Error).message}</div>}
        {save.isSuccess && <div className="text-sm text-litera-accent mt-3">{t("settings.saved")}</div>}
      </div>
    </section>
  );
}

function ProfilesTab({
  draft, isLoading, activeMissing, onUpsert, onRemove, onSetActive,
}: {
  draft: LlmConfig;
  isLoading: boolean;
  activeMissing: boolean;
  onUpsert: (profile: LlmProfile, originalName?: string) => void;
  onRemove: (name: string) => void;
  onSetActive: (name: string) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="mb-4">
        <p className="text-xs text-litera-mute">{t("settings.llmHint")}</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onUpsert(blankProfile(p.profile))}
            className="litera-btn text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-litera-mute text-sm">{t("common.loading")}</div>
      ) : draft.profiles.length === 0 ? (
        <div className="litera-panel p-8 text-center">
          <KeyRound className="h-8 w-8 mx-auto mb-2 text-litera-mute" />
          <p className="text-sm text-litera-text">{t("settings.emptyTitle")}</p>
          <p className="text-xs text-litera-mute mt-1">{t("settings.emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {draft.profiles.map((p) => (
            <ProfileCard
              key={p.name}
              profile={p}
              isActive={draft.active === p.name}
              onChange={(np, oldName) => onUpsert(np, oldName)}
              onRemove={() => onRemove(p.name)}
              onActivate={() => onSetActive(p.name)}
            />
          ))}
        </ul>
      )}

      {activeMissing && (
        <div className="mt-3 text-sm text-red-400/90">
          {t("settings.activeMissing", { profile: draft.active })}
        </div>
      )}
    </>
  );
}

function blankProfile(preset?: Partial<LlmProfile>): LlmProfile {
  return {
    name: preset?.chat_model ? `${preset.chat_model}` : "new",
    base_url: preset?.base_url ?? "https://api.openai.com/v1",
    api_key: preset?.api_key ?? "",
    chat_model: preset?.chat_model ?? "gpt-4o-mini",
    embed_model: preset?.embed_model ?? null,
    max_tokens: 1024,
    temperature: 0.3,
  };
}
