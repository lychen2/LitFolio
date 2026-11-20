import { Route } from "@/components/icons";
import { type LlmConfig, type TaskBinding } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

type TaskKey = keyof LlmConfig["task_assignments"];

interface TaskItem {
  key: TaskKey;
  labelKey: "settings.tasks.tldr" | "settings.tasks.quickRead" | "settings.tasks.translate" | "settings.tasks.topicSurvey" | "settings.tasks.tag";
  hintKey: "settings.tasks.tldrHint" | "settings.tasks.quickReadHint" | "settings.tasks.translateHint" | "settings.tasks.topicSurveyHint" | "settings.tasks.tagHint";
}

const TASKS: TaskItem[] = [
  { key: "tldr", labelKey: "settings.tasks.tldr", hintKey: "settings.tasks.tldrHint" },
  { key: "quick_read", labelKey: "settings.tasks.quickRead", hintKey: "settings.tasks.quickReadHint" },
  { key: "translate", labelKey: "settings.tasks.translate", hintKey: "settings.tasks.translateHint" },
  { key: "topic_survey", labelKey: "settings.tasks.topicSurvey", hintKey: "settings.tasks.topicSurveyHint" },
  { key: "tag", labelKey: "settings.tasks.tag", hintKey: "settings.tasks.tagHint" },
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
    <section className="litera-panel space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-medium text-litera-text">
          <Route className="size-4 text-litera-accent2" aria-hidden="true" />
          {t("settings.tasks.title")}
        </h2>
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
              className="flex min-w-0 flex-col justify-between gap-2 rounded-[var(--litera-radius)] border border-litera-border bg-litera-surface/90 p-3"
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
                <p className="mt-1 text-xs text-litera-mute">{t(task.hintKey)}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <select
                  value={selectedProfileName}
                  onChange={(e) => updateBinding(task.key, e.target.value, binding?.model ?? "")}
                  className="litera-input min-w-0 text-xs"
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
                  className="litera-input min-w-0 font-mono text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
