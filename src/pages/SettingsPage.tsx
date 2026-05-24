import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Save, Trash2, Loader2, KeyRound, Globe, Cpu, Eye, EyeOff, CheckCircle2, XCircle,
} from "lucide-react";
import { api, type LlmConfig, type LlmProfile } from "@/lib/api";

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "OpenAI",      profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek",    profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: null } },
  { label: "Moonshot",    profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: null } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Ollama",      profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "nomic-embed-text", api_key: "ollama" } },
];

export function SettingsPage() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
  });
  const [draft, setDraft] = useState<LlmConfig>({
    profiles: [],
    active: null,
    task_assignments: { tldr: null, quick_read: null, translate: null, tag: null, link: null },
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
      return { ...d, profiles, active: d.active ?? profile.name };
    });
  }
  function remove(name: string) {
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.filter((p) => p.name !== name),
      active: d.active === name ? null : d.active,
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

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">设置</h1>
          <p className="text-sm text-litera-mute">LLM 端点 · 文献库设置</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate(draft)}
            disabled={save.isPending}
            className="litera-btn-primary disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl">
        <div className="mb-4">
          <h2 className="text-litera-text font-medium mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-litera-accent" /> LLM 配置
          </h2>
          <p className="text-xs text-litera-mute">
            任何兼容 OpenAI 协议的端点均可使用,可选用预设或自行填写。
          </p>
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
          <div className="text-litera-mute text-sm">加载中…</div>
        ) : draft.profiles.length === 0 ? (
          <div className="litera-panel p-8 text-center">
            <KeyRound className="h-8 w-8 mx-auto mb-2 text-litera-mute" />
            <p className="text-sm text-litera-text">还没有 LLM 配置。</p>
            <p className="text-xs text-litera-mute mt-1">点击上方任意预设即可开始。</p>
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

        {save.error && <div className="text-sm text-red-400/90 mt-3">✕ {(save.error as Error).message}</div>}
        {save.isSuccess && <div className="text-sm text-litera-accent mt-3">✓ 已保存。</div>}
      </div>
    </section>
  );
}

function ProfileCard({
  profile, isActive, onChange, onRemove, onActivate,
}: {
  profile: LlmProfile;
  isActive: boolean;
  onChange: (next: LlmProfile, originalName: string) => void;
  onRemove: () => void;
  onActivate: () => void;
}) {
  const [local, setLocal] = useState(profile);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => { setLocal(profile); }, [profile.name]);

  const test = useMutation({ mutationFn: (p: LlmProfile) => api.llmTest(p) });

  function field<K extends keyof LlmProfile>(k: K, v: LlmProfile[K]) {
    const next = { ...local, [k]: v } as LlmProfile;
    setLocal(next);
    onChange(next, profile.name);
  }

  return (
    <li className={
      "litera-panel p-4 transition-colors " +
      (isActive ? "border-litera-accent/50 bg-litera-accent/5" : "")
    }>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <input
            value={local.name}
            onChange={(e) => field("name", e.target.value)}
            className="litera-input text-sm font-medium w-40"
          />
          {isActive ? (
            <span className="px-2 py-0.5 text-[11px] rounded border border-litera-accent/40 bg-litera-accent/10 text-litera-accent">
              当前
            </span>
          ) : (
            <button onClick={onActivate} className="text-[11px] text-litera-mute hover:text-litera-text">
              设为当前
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => test.mutate(local)}
            disabled={test.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            测试连接
          </button>
          <button onClick={onRemove} className="litera-btn text-xs text-red-400/80 hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <FieldLabel label="API 地址">
          <input value={local.base_url} onChange={(e) => field("base_url", e.target.value)}
            className="litera-input w-full font-mono text-xs" placeholder="https://api.openai.com/v1" />
        </FieldLabel>
        <FieldLabel label="密钥">
          <div className="relative">
            <input value={local.api_key} onChange={(e) => field("api_key", e.target.value)}
              type={showKey ? "text" : "password"}
              className="litera-input w-full font-mono text-xs pr-9" placeholder="sk-…" />
            <button onClick={() => setShowKey(!showKey)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </FieldLabel>
        <FieldLabel label="对话模型">
          <input value={local.chat_model} onChange={(e) => field("chat_model", e.target.value)}
            className="litera-input w-full font-mono text-xs" placeholder="gpt-4o-mini" />
        </FieldLabel>
        <FieldLabel label="向量模型 (可选)">
          <input value={local.embed_model ?? ""}
            onChange={(e) => field("embed_model", e.target.value || null)}
            className="litera-input w-full font-mono text-xs"
            placeholder="text-embedding-3-small" />
        </FieldLabel>
        <FieldLabel label="最大 token">
          <input type="number" value={local.max_tokens}
            onChange={(e) => field("max_tokens", parseInt(e.target.value || "0"))}
            className="litera-input w-full" min={1} max={32000} />
        </FieldLabel>
        <FieldLabel label="采样温度">
          <input type="number" step="0.1" value={local.temperature}
            onChange={(e) => field("temperature", parseFloat(e.target.value || "0"))}
            className="litera-input w-full" min={0} max={2} />
        </FieldLabel>
      </div>

      {test.isSuccess && (
        <div className="mt-3 text-xs flex items-center gap-2 text-litera-accent">
          <CheckCircle2 className="h-4 w-4" />
          {test.data.model} replied: “{test.data.reply.trim()}”
        </div>
      )}
      {test.isError && (
        <div className="mt-3 text-xs flex items-center gap-2 text-red-400/90">
          <XCircle className="h-4 w-4" /> {(test.error as Error).message}
        </div>
      )}
    </li>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-litera-mute">{label}</span>
      {children}
    </label>
  );
}
