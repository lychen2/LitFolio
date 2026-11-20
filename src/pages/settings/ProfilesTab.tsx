import { Plus } from "@/components/icons";
import { Button } from "@/components/ui";
import { type LlmConfig, type LlmProfile } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { ProfileCard } from "./ProfileCard";
import { TaskAssignmentsPanel } from "./TaskAssignmentsPanel";

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "Ollama (MiniLM)", profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "all-minilm", api_key: "ollama" } },
  { label: "OpenAI", profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek", profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: "all-MiniLM-L6-v2" } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Moonshot", profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: "all-MiniLM-L6-v2" } },
];

export function ProfilesTab({
  draft,
  isLoading,
  activeMissing,
  onUpsert,
  onRemove,
  onSetActive,
  onUpdateTaskAssignments,
}: {
  draft: LlmConfig;
  isLoading: boolean;
  activeMissing: boolean;
  onUpsert: (profile: LlmProfile, originalName?: string) => void;
  onRemove: (name: string) => void;
  onSetActive: (name: string) => void;
  onUpdateTaskAssignments: (assignments: LlmConfig["task_assignments"]) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} size="sm" onClick={() => onUpsert(blankProfile(preset.profile))}>
            <Plus className="h-3.5 w-3.5" /> {preset.label}
          </Button>
        ))}
      </div>
      <details className="text-xs text-litera-mute">
        <summary className="w-fit cursor-pointer hover:text-litera-text">{t("settings.llmConfig")}</summary>
        <p className="mt-2 leading-relaxed">{t("settings.llmHint")}</p>
      </details>
      {isLoading ? (
        <div className="text-sm text-litera-mute">{t("common.loading")}</div>
      ) : draft.profiles.length === 0 ? (
        <div className="litera-panel p-4">
          <p className="text-sm text-litera-text">{t("settings.emptyTitle")}</p>
          <p className="mt-1 text-xs text-litera-mute">{t("settings.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-4 litera-stagger">
            {draft.profiles.map((profile, index) => (
              <ProfileCard
                key={`profile-${index}`}
                profile={profile}
                isActive={draft.active === profile.name}
                onChange={(next, oldName) => onUpsert(next, oldName)}
                onRemove={() => onRemove(profile.name)}
                onActivate={() => onSetActive(profile.name)}
              />
            ))}
          </ul>

          <TaskAssignmentsPanel
            draft={draft}
            onChange={onUpdateTaskAssignments}
          />
        </div>
      )}
      {activeMissing && (
        <div className="text-sm text-litera-error">
          {t("settings.activeMissing", { profile: draft.active })}
        </div>
      )}
    </div>
  );
}

function blankProfile(preset?: Partial<LlmProfile>): LlmProfile {
  return {
    name: preset?.chat_model ? `${preset.chat_model}` : "new",
    base_url: preset?.base_url ?? "https://api.openai.com/v1",
    api_key: preset?.api_key ?? "",
    chat_model: preset?.chat_model ?? "gpt-4o-mini",
    embed_model: preset?.embed_model !== undefined ? preset.embed_model : "all-MiniLM-L6-v2",
    max_tokens: 1024,
    temperature: 0.3,
    thinking_mode: "auto",
    thinking_format: "auto",
    reasoning_effort: "auto",
  };
}
