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

type TaskKey = keyof TaskAssignmentsShape;

const TASK_LABELS: { key: TaskKey; label: string; hint: string }[] = [
  { key: "tldr",       label: "速读 (TL;DR)",  hint: "一句话摘要 + 关键发现" },
  { key: "quick_read", label: "深读",         hint: "问题 / 方法 / 不同 / 局限四段式" },
  { key: "translate",  label: "翻译",         hint: "标题 + 摘要译为中文" },
  { key: "topic_survey", label: "综述生成",    hint: "拆解领域 + 标注必读" },
  { key: "ask",        label: "RAG 提问",     hint: "基于文献库回答问题" },
  { key: "tag",        label: "标签",         hint: "后续自动标签功能" },
  { key: "link",       label: "关联",         hint: "后续论文关联功能" },
];

export function TaskAssignments({
  draft, onChange,
}: {
  draft: LlmConfig;
  onChange: (next: LlmConfig) => void;
}) {
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
          <Workflow className="h-4 w-4 text-litera-accent" /> 任务分配
        </h2>
        <p className="text-xs text-litera-mute mt-1">
          每个任务可绑定 (配置, 模型) 二元组 — 同一个配置(同一个 key)可以选择不同模型,
          不用为每个模型都建一个 profile。留空时回退到「当前」profile 的默认模型。
        </p>
      </div>
      <ul className="litera-panel divide-y divide-litera-line">
        {TASK_LABELS.map(({ key, label, hint }) => (
          <TaskRow
            key={key}
            taskKey={key}
            label={label}
            hint={hint}
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
  const selectedProfile = profiles.find((p) => p.name === binding?.profile);
  const [models, setModels] = useState<string[] | null>(null);
  const modelListId = `task-models-${taskKey}`;
  // Re-prime the model dropdown when the bound profile changes
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

      <select
        value={binding?.profile ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(null);
          else onChange({ profile: v, model: binding?.model ?? null });
        }}
        className="litera-input text-xs w-44 font-mono shrink-0"
      >
        <option value="">— 用「当前」 ({activeProfile ?? "无"}) —</option>
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
            placeholder={`默认: ${selectedProfile.chat_model}`}
            title="留空使用该 profile 的默认对话模型；也可以手填任意兼容模型名"
          />
          <datalist id={modelListId}>
            <option value={selectedProfile.chat_model} />
            {models?.map((m) => <option key={m} value={m} />)}
          </datalist>
          <button
            onClick={() => listModels.mutate(selectedProfile)}
            disabled={listModels.isPending}
            className="litera-btn text-xs shrink-0 disabled:opacity-50"
            title="GET /v1/models 拉取该配置下可用模型"
          >
            {listModels.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            📥
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
