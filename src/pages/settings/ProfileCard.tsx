import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Trash2, Loader2, Globe, Eye, EyeOff, CheckCircle2, XCircle, Download,
} from "lucide-react";
import { api, type LlmProfile } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ProfileCard({
  profile, isActive, onChange, onRemove, onActivate,
}: {
  profile: LlmProfile;
  isActive: boolean;
  onChange: (next: LlmProfile, originalName: string) => void;
  onRemove: () => void;
  onActivate: () => void;
}) {
  const t = useT();
  const [local, setLocal] = useState(profile);
  const [showKey, setShowKey] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  useEffect(() => { setLocal(profile); setFetchedModels(null); }, [profile.name]);

  const test = useMutation({ mutationFn: (p: LlmProfile) => api.llmTest(p) });
  const listModels = useMutation({
    mutationFn: (p: LlmProfile) => api.llmListModels(p),
    onSuccess: (m) => setFetchedModels(m),
  });

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
              {t("settings.profile.current")}
            </span>
          ) : (
            <button onClick={onActivate} className="text-[11px] text-litera-mute hover:text-litera-text">
              {t("settings.profile.setCurrent")}
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
            {t("settings.profile.test")}
          </button>
          <button onClick={onRemove} className="litera-btn text-xs text-red-400/80 hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label={t("settings.profile.apiBaseUrl")}>
          <input value={local.base_url} onChange={(e) => field("base_url", e.target.value)}
            className="litera-input w-full font-mono text-xs" placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label={t("settings.profile.apiKey")}>
          <div className="relative">
            <input value={local.api_key} onChange={(e) => field("api_key", e.target.value)}
              type={showKey ? "text" : "password"}
              className="litera-input w-full font-mono text-xs pr-9" placeholder="sk-…" />
            <button onClick={() => setShowKey(!showKey)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </Field>
        <Field label={t("settings.profile.chatModel")}>
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                value={local.chat_model}
                onChange={(e) => field("chat_model", e.target.value)}
                list={`models-${profile.name}`}
                className="litera-input w-full font-mono text-xs"
                placeholder={t("settings.profile.chatModelPlaceholder")}
              />
              <datalist id={`models-${profile.name}`}>
                {fetchedModels?.map((m) => <option key={m} value={m} />)}
              </datalist>
              <button
                onClick={() => listModels.mutate(local)}
                disabled={listModels.isPending}
                className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
                title={t("settings.profile.fetchModelsTitle")}
              >
                {listModels.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t("settings.profile.fetchModels")}
              </button>
            </div>
            {listModels.error && (
              <div className="text-[11px] text-red-400/90">✕ {(listModels.error as Error).message}</div>
            )}
            {fetchedModels && (
              <div className="text-[11px] text-litera-mute">
                {fetchedModels.length === 0
                  ? t("settings.profile.modelsEmpty")
                  : t("settings.profile.modelsFound", { count: fetchedModels.length })}
              </div>
            )}
          </div>
        </Field>
        <Field label={t("settings.profile.embedModel")}>
          <input value={local.embed_model ?? ""}
            onChange={(e) => field("embed_model", e.target.value || null)}
            className="litera-input w-full font-mono text-xs"
            placeholder="text-embedding-3-small" />
        </Field>
        <Field label={t("settings.profile.temperature")}>
          <input type="number" step="0.1" value={local.temperature}
            onChange={(e) => field("temperature", parseFloat(e.target.value || "0"))}
            className="litera-input w-full" min={0} max={2} />
        </Field>
      </div>

      {test.isSuccess && (
        <div className="mt-3 text-xs flex items-center gap-2 text-litera-accent">
          <CheckCircle2 className="h-4 w-4" />
          {t("settings.profile.testReply", {
            model: test.data.model,
            reply: test.data.reply.trim(),
          })}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-litera-mute">{label}</span>
      {children}
    </label>
  );
}
