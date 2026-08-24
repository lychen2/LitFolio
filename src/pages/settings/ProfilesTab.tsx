import { Plus, KeyRound } from "lucide-react";
import { type LlmConfig, type LlmProfile } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { ProfileCard } from "./ProfileCard";

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "OpenAI", profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek", profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: null } },
  { label: "Moonshot", profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: null } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Ollama", profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "nomic-embed-text", api_key: "ollama" } },
];

export function ProfilesTab({
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
        {PRESETS.map((preset) => (
          <button key={preset.label} onClick={() => onUpsert(blankProfile(preset.profile))} className="litera-btn text-xs">
            <Plus className="h-3.5 w-3.5" /> {preset.label}
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
        <ul className="space-y-3 litera-stagger">
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
      )}
      {activeMissing && (
        <div className="mt-3 text-sm text-litera-error">
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
