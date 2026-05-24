import { Workflow } from "lucide-react";
import { type LlmConfig, type LlmProfile } from "@/lib/api";

type TaskKey = "tldr" | "quick_read" | "translate";

const TASK_LABELS: { key: TaskKey; label: string; hint: string }[] = [
  { key: "tldr",       label: "速读 (TL;DR)",  hint: "一句话摘要 + 关键发现" },
  { key: "quick_read", label: "深读",         hint: "问题 / 方法 / 不同 / 局限四段式" },
  { key: "translate",  label: "翻译",         hint: "标题 + 摘要译为中文" },
];

export function TaskAssignments({
  draft, onChange,
}: {
  draft: LlmConfig;
  onChange: (next: LlmConfig) => void;
}) {
  if (draft.profiles.length === 0) return null;

  function update(task: TaskKey, value: string | null) {
    onChange({
      ...draft,
      task_assignments: { ...draft.task_assignments, [task]: value },
    });
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="text-litera-text font-medium flex items-center gap-2">
          <Workflow className="h-4 w-4 text-litera-accent" /> 任务分配
        </h2>
        <p className="text-xs text-litera-mute mt-1">
          指定每种任务用哪个配置 — 例如翻译走便宜模型,深读走更强的。
          留空时回退到「当前」profile。
        </p>
      </div>
      <ul className="litera-panel divide-y divide-litera-line">
        {TASK_LABELS.map(({ key, label, hint }) => (
          <li key={key} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-litera-text">{label}</div>
              <div className="text-[11px] text-litera-mute mt-0.5">{hint}</div>
            </div>
            <select
              value={draft.task_assignments[key] ?? ""}
              onChange={(e) => update(key, e.target.value || null)}
              className="litera-input text-xs w-56 font-mono shrink-0"
            >
              <option value="">— 用「当前」 ({draft.active ?? "无"}) —</option>
              {draft.profiles.map((p: LlmProfile) => (
                <option key={p.name} value={p.name}>
                  {p.name} · {p.chat_model}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
