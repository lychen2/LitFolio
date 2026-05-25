import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Save, Loader2, KeyRound, Cpu } from "lucide-react";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";
import { ProfileCard } from "./settings/ProfileCard";
import { TaskAssignments } from "./settings/TaskAssignments";
import { useT } from "@/i18n/I18nProvider";

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "OpenAI",      profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek",    profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: null } },
  { label: "Moonshot",    profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: null } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Ollama",      profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "nomic-embed-text", api_key: "ollama" } },
];

export function SettingsPage() {
  const t = useT();
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
  const activeMissing = draft.active && !draft.profiles.some((p) => p.name === draft.active);

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-litera-mute">{t("settings.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate(draft)}
            disabled={save.isPending}
            className="litera-btn-primary disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("common.save")}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl">
        <div className="mb-4">
          <h2 className="text-litera-text font-medium mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-litera-accent" /> {t("settings.llmConfig")}
          </h2>
          <p className="text-xs text-litera-mute">{t("settings.llmHint")}</p>
        </div>

        <div className="flex gap-2 flex-wrap mb-5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => upsert(blankProfile(p.profile))}
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
                onChange={(np, oldName) => upsert(np, oldName)}
                onRemove={() => remove(p.name)}
                onActivate={() => setActive(p.name)}
              />
            ))}
          </ul>
        )}

        {activeMissing && (
          <div className="mt-3 text-sm text-red-400/90">
            {t("settings.activeMissing", { profile: draft.active })}
          </div>
        )}

        <TaskAssignments draft={draft} onChange={setDraft} />

        {save.error && <div className="text-sm text-red-400/90 mt-3">✕ {(save.error as Error).message}</div>}
        {save.isSuccess && <div className="text-sm text-litera-accent mt-3">{t("settings.saved")}</div>}
      </div>
    </section>
  );
}
