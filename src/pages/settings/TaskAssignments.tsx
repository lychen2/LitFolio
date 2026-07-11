import { useEffect, useState } from "react";
import { Workflow, Loader2, Download } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
  api,
  type LlmConfig,
  type LlmProfile,
  type TaskAssignments as TaskAssignmentsShape,
  type TaskBinding,
} from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";

type TaskKey = keyof TaskAssignmentsShape;

const TASK_LABELS: { key: TaskKey; labelKey: TKey; hintKey: TKey }[] = [
  { key: "tldr", labelKey: "settings.tasks.tldr", hintKey: "settings.tasks.tldrHint" },
  { key: "quick_read", labelKey: "settings.tasks.quickRead", hintKey: "settings.tasks.quickReadHint" },
  { key: "translate", labelKey: "settings.tasks.translate", hintKey: "settings.tasks.translateHint" },
  { key: "topic_survey", labelKey: "settings.tasks.topicSurvey", hintKey: "settings.tasks.topicSurveyHint" },
  { key: "ask", labelKey: "settings.tasks.ask", hintKey: "settings.tasks.askHint" },
  { key: "tag", labelKey: "settings.tasks.tag", hintKey: "settings.tasks.tagHint" },
  { key: "link", labelKey: "settings.tasks.link", hintKey: "settings.tasks.linkHint" },
  { key: "lit_review", labelKey: "settings.tasks.litReview", hintKey: "settings.tasks.litReviewHint" },
];

export function TaskAssignments({
  draft, onChange,
}: {
  draft: LlmConfig;
  onChange: (next: LlmConfig) => void;
}) {
  const t = useT();
  if (draft.profiles.length === 0) return null;

  function update(task: TaskKey, value: TaskBinding | null) {
    onChange({
      ...draft,
      task_assignments: { ...draft.task_assignments, [task]: value },
    });
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="text-litera-text font-medium flex items-center gap-2">
          <Workflow className="h-4 w-4 text-litera-accent" /> {t("settings.tasks.title")}
        </h2>
        <p className="text-xs text-litera-mute mt-1">{t("settings.tasks.hint")}</p>
      </div>
      <ul className="litera-panel divide-y divide-litera-line">
        {TASK_LABELS.map(({ key, labelKey, hintKey }) => (
          <TaskRow
            key={key}
            taskKey={key}
            label={t(labelKey)}
            hint={t(hintKey)}
            profiles={draft.profiles}
            binding={draft.task_assignments[key]}
            activeProfile={draft.active}
            onChange={(b) => update(key, b)}
          />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  taskKey, label, hint, profiles, binding, activeProfile, onChange,
}: {
  taskKey: TaskKey;
  label: string;
  hint: string;
  profiles: LlmProfile[];
  binding: TaskBinding | null;
  activeProfile: string | null;
  onChange: (b: TaskBinding | null) => void;
}) {
  const t = useT();
  const selectedProfile = profiles.find((p) => p.name === binding?.profile);
  const [models, setModels] = useState<string[] | null>(null);
  const modelListId = `task-models-${taskKey}`;
  // Re-prime the model dropdown when the bound profile changes
  const effectiveModel = binding?.model || selectedProfile?.chat_model || null;
  useEffect(() => { setModels(null); }, [binding?.profile]);

  const listModels = useMutation({
    mutationFn: (p: LlmProfile) => api.llmListModels(p),
    onSuccess: (m) => setModels(m),
  });

  return (
    <li className="px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 w-44 shrink-0">
        <div className="text-sm text-litera-text">{label}</div>
        <div className="text-[11px] text-litera-mute mt-0.5">{hint}</div>
      </div>
        {binding?.profile && effectiveModel && (
          <div className="mt-1 text-[11px] font-mono text-litera-accent">
            {binding.profile} / {effectiveModel}
          </div>
        )}

      <select
        value={binding?.profile ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(null);
          else onChange({ profile: v, model: binding?.model ?? null });
        }}
        className="litera-input text-xs w-44 font-mono shrink-0"
      >
        <option value="">{t("settings.tasks.useCurrent", { profile: activeProfile ?? t("common.none") })}</option>
        {profiles.map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>

      {selectedProfile && (
        <>
          <input
            list={modelListId}
            value={binding?.model ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ profile: selectedProfile.name, model: v || null });
            }}
            className="litera-input text-xs flex-1 min-w-[12rem] font-mono"
            placeholder={t("settings.tasks.modelPlaceholder", { model: selectedProfile.chat_model })}
            title={t("settings.tasks.modelTitle")}
          />
          <datalist id={modelListId}>
            <option value={selectedProfile.chat_model} />
            {models?.map((m) => <option key={m} value={m} />)}
          </datalist>
          <button
            onClick={() => listModels.mutate(selectedProfile)}
            disabled={listModels.isPending}
            className="litera-btn text-xs shrink-0 disabled:opacity-50"
            title={t("settings.tasks.fetchModelsTitle")}
          >
            {listModels.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
      {listModels.error && (
        <div className="basis-full text-[11px] text-red-400/90 pl-44">
          ✕ {(listModels.error as Error).message}
        </div>
      )}
    </li>
  );
}
