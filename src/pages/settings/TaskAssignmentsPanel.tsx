import { Route } from "lucide-react";
import { type LlmConfig, type TaskBinding } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

type TaskKey = keyof LlmConfig["task_assignments"];

interface TaskItem {
  key: TaskKey;
  labelKey: "settings.tasks.tldr" | "settings.tasks.quickRead" | "settings.tasks.translate" | "settings.tasks.ask" | "settings.tasks.litReview" | "settings.tasks.topicSurvey" | "settings.tasks.tag" | "settings.tasks.link";
  hintKey: "settings.tasks.tldrHint" | "settings.tasks.quickReadHint" | "settings.tasks.translateHint" | "settings.tasks.askHint" | "settings.tasks.litReviewHint" | "settings.tasks.topicSurveyHint" | "settings.tasks.tagHint" | "settings.tasks.linkHint";
}

const TASKS: TaskItem[] = [
  { key: "tldr", labelKey: "settings.tasks.tldr", hintKey: "settings.tasks.tldrHint" },
  { key: "quick_read", labelKey: "settings.tasks.quickRead", hintKey: "settings.tasks.quickReadHint" },
  { key: "translate", labelKey: "settings.tasks.translate", hintKey: "settings.tasks.translateHint" },
  { key: "ask", labelKey: "settings.tasks.ask", hintKey: "settings.tasks.askHint" },
  { key: "lit_review", labelKey: "settings.tasks.litReview", hintKey: "settings.tasks.litReviewHint" },
  { key: "topic_survey", labelKey: "settings.tasks.topicSurvey", hintKey: "settings.tasks.topicSurveyHint" },
  { key: "tag", labelKey: "settings.tasks.tag", hintKey: "settings.tasks.tagHint" },
  { key: "link", labelKey: "settings.tasks.link", hintKey: "settings.tasks.linkHint" },
];

export function TaskAssignmentsPanel({
  draft,
  onChange,
}: {
  draft: LlmConfig;
  onChange: (assignments: LlmConfig["task_assignments"]) => void;
}) {
  const t = useT();

  function updateBinding(key: TaskKey, profile: string, model: string) {
    const trimmedProfile = profile.trim();
    const trimmedModel = model.trim();

    const nextBinding: TaskBinding | null = !trimmedProfile && !trimmedModel
      ? null
      : {
          profile: trimmedProfile || draft.active || (draft.profiles[0]?.name ?? ""),
          model: trimmedModel || null,
        };

    onChange({
      ...draft.task_assignments,
      [key]: nextBinding,
    });
  }

  const activeProfile = draft.profiles.find((p) => p.name === draft.active) ?? draft.profiles[0] ?? null;

  return (
    <div className="litera-panel p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-litera-text">
          <Route className="h-4 w-4 text-litera-accent" />
          {t("settings.tasks.title")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-litera-mute">{t("settings.tasks.hint")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TASKS.map((task) => {
          const binding = draft.task_assignments[task.key];
          const selectedProfileName = binding?.profile ?? "";
          const targetProfile = draft.profiles.find((p) => p.name === selectedProfileName) ?? activeProfile;
          const defaultModelPlaceholder = targetProfile ? targetProfile.chat_model : "gpt-4o-mini";

          return (
            <div
              key={task.key}
              className="flex flex-col justify-between gap-2.5 rounded-[var(--litera-radius)] border border-litera-border bg-litera-surface/90 p-3.5 transition-all hover:border-litera-border-strong hover:bg-litera-surface2"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-litera-text">{t(task.labelKey)}</span>
                  {binding && (
                    <span className="litera-badge text-[10px]">
                      {binding.profile}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-litera-mute">{t(task.hintKey)}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <select
                  value={selectedProfileName}
                  onChange={(e) => updateBinding(task.key, e.target.value, binding?.model ?? "")}
                  className="litera-input text-xs"
                >
                  <option value="">
                    {t("settings.tasks.useCurrent", { profile: draft.active || "默认" })}
                  </option>
                  {draft.profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.chat_model})
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={binding?.model ?? ""}
                  onChange={(e) => updateBinding(task.key, selectedProfileName, e.target.value)}
                  placeholder={t("settings.tasks.modelPlaceholder", { model: defaultModelPlaceholder })}
                  title={t("settings.tasks.modelTitle")}
                  className="litera-input font-mono text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
