import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Trash2, Spinner, Globe, Eye, EyeOff, CheckCircle2, XCircle, Download,
} from "@/components/icons";
import { Button, IconButton, Input } from "@/components/ui";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  useEffect(() => { setLocal(profile); setFetchedModels(null); setConfirmingDelete(false); }, [profile]);

  const test = useMutation({ mutationFn: (p: LlmProfile) => api.llmTest(p) });
  const listModels = useMutation({
    mutationFn: (p: LlmProfile) => api.llmListModels(p),
    onSuccess: (m) => setFetchedModels(m),
  });
  const pullModel = useMutation({
    mutationFn: (modelToPull: string) => api.llmPullModel(local, modelToPull),
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
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            value={local.name}
            onChange={(e) => field("name", e.target.value)}
            aria-label={t("settings.llmConfig")}
            className="w-full font-medium sm:w-40"
          />
          {isActive ? (
            <span className="litera-badge text-[11px]">
              {t("settings.profile.current")}
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={onActivate}>
              {t("settings.profile.setCurrent")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => test.mutate(local)}
            disabled={test.isPending}
          >
            {test.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            {t("settings.profile.test")}
          </Button>
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-litera-error">{t("settings.profile.deleteConfirm")}</span>
              <Button variant="primary" size="sm" onClick={() => { onRemove(); setConfirmingDelete(false); }}>{t("settings.profile.confirm")}</Button>
              <Button size="sm" onClick={() => setConfirmingDelete(false)}>{t("common.cancel")}</Button>
            </div>
          ) : (
            <IconButton label={t("common.delete")} size="sm" onClick={() => setConfirmingDelete(true)} className="text-litera-error hover:text-litera-error">
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Field label={t("settings.profile.apiBaseUrl")}>
          <Input value={local.base_url} onChange={(e) => field("base_url", e.target.value)}
            className="w-full font-mono text-xs" placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label={t("settings.profile.apiKey")}>
          <div className="relative">
            <Input value={local.api_key} onChange={(e) => field("api_key", e.target.value)}
              type={showKey ? "text" : "password"}
              className="w-full pr-10 font-mono text-xs" placeholder="sk-…" />
            <IconButton onClick={() => setShowKey(!showKey)}
              label={t("settings.profile.apiKey")}
              size="sm"
              aria-pressed={showKey}
              className="absolute right-1 top-1/2 -translate-y-1/2">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </IconButton>
          </div>
        </Field>
        <Field label={t("settings.profile.chatModel")}>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={local.chat_model}
                onChange={(e) => field("chat_model", e.target.value)}
                list={`models-${profile.name}`}
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder={t("settings.profile.chatModelPlaceholder")}
              />
              <datalist id={`models-${profile.name}`}>
                {fetchedModels?.map((m) => <option key={m} value={m} />)}
              </datalist>
              <Button
                onClick={() => listModels.mutate(local)}
                disabled={listModels.isPending}
                className="whitespace-nowrap"
                title={t("settings.profile.fetchModelsTitle")}
              >
                {listModels.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t("settings.profile.fetchModels")}
              </Button>
            </div>
            {listModels.error && (
              <div className="text-[11px] text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(listModels.error as Error).message}</div>
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
          <div className="flex gap-2">
            <Input
              value={local.embed_model ?? ""}
              onChange={(e) => field("embed_model", e.target.value || null)}
              className="min-w-0 flex-1 font-mono text-xs"
              placeholder="all-MiniLM-L6-v2"
            />
            {local.embed_model && (
              <Button
                onClick={() => pullModel.mutate(local.embed_model!)}
                disabled={pullModel.isPending}
                className="whitespace-nowrap"
                title={t("settings.profile.pullModelTitle")}
              >
                {pullModel.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t("settings.profile.pullModel")}
              </Button>
            )}
          </div>
          {pullModel.isSuccess && (
            <div className="text-[11px] text-litera-success flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {pullModel.data}
            </div>
          )}
          {pullModel.isError && (
            <div className="text-[11px] text-litera-error">
              <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(pullModel.error as Error).message}
            </div>
          )}
        </Field>
        <Field label={t("settings.profile.maxTokens")}>
          <Input type="number" step="1" min={1} value={local.max_tokens}
            onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value) && value > 0) field("max_tokens", value); }}
            className="w-full" />
        </Field>
        <Field label={t("settings.profile.temperature")}>
          <Input type="number" step="0.1" value={local.temperature}
            onChange={(e) => field("temperature", parseFloat(e.target.value || "0"))}
            className="w-full" min={0} max={2} />
        </Field>
      </div>

      <details className="mt-4 border-t border-litera-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-litera-text">{t("settings.profile.reasoningSettings")}</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("settings.profile.thinkingMode")}>
            <select aria-label={t("settings.profile.thinkingMode")} className="litera-input w-full text-xs" value={local.thinking_mode ?? "auto"}
              onChange={(e) => field("thinking_mode", e.target.value as LlmProfile["thinking_mode"])}>
              <option value="auto">{t("settings.profile.modeAuto")}</option>
              <option value="disabled">{t("settings.profile.modeDisabled")}</option>
              <option value="enabled">{t("settings.profile.modeEnabled")}</option>
            </select>
          </Field>
          <Field label={t("settings.profile.thinkingFormat")}>
            <select aria-label={t("settings.profile.thinkingFormat")} className="litera-input w-full text-xs" value={local.thinking_format ?? "auto"}
              onChange={(e) => field("thinking_format", e.target.value as LlmProfile["thinking_format"])}>
              <option value="auto">{t("settings.profile.formatAuto")}</option>
              <option value="thinking">thinking.type</option>
              <option value="enable_thinking">enable_thinking</option>
              <option value="chat_template">chat_template_kwargs.enable_thinking</option>
              <option value="reasoning_effort">reasoning_effort</option>
              <option value="omit">{t("settings.profile.formatOmit")}</option>
            </select>
          </Field>
          <Field label={t("settings.profile.reasoningEffort")}>
            <select aria-label={t("settings.profile.reasoningEffort")} className="litera-input w-full text-xs" value={local.reasoning_effort ?? "auto"}
              onChange={(e) => field("reasoning_effort", e.target.value as LlmProfile["reasoning_effort"])}>
              <option value="auto">{t("settings.profile.effortAuto")}</option>
              <option value="low">{t("settings.profile.effortLow")}</option>
              <option value="medium">{t("settings.profile.effortMedium")}</option>
              <option value="high">{t("settings.profile.effortHigh")}</option>
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-litera-mute">{t("settings.profile.reasoningHint")}</p>
      </details>

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
        <div className="mt-3 text-xs flex items-center gap-2 text-litera-error">
          <XCircle className="h-4 w-4" /> {(test.error as Error).message}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-litera-mute">{label}</span>
      {children}
    </label>
  );
}
