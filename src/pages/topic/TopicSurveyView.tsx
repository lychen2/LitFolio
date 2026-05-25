import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BookOpenText, Loader2, Compass, Sparkles, AlertCircle, Save, Trash2,
} from "lucide-react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  api,
  subscribeTopicSurveyProgress,
  type TopicSurvey,
  type TopicSurveyProgress,
} from "@/lib/api";
import { SubareaCard } from "./SubareaCard";
import { KeyPiList } from "./KeyPiList";
import { MustReadShortlist } from "./MustReadShortlist";

const SAVED_SURVEYS_KEY = "litera.topic.surveys";
const CURRENT_SURVEY_KEY = "litera.topic.current";

interface SavedSurvey {
  id: string;
  topic: string;
  savedAt: number;
  survey: TopicSurvey;
}

export function TopicSurveyView() {
  const [topic, setTopic] = useState("");
  const [annotate, setAnnotate] = useState(true);
  const [survey, setSurvey] = useState<TopicSurvey | null>(null);
  const [saved, setSaved] = useState<SavedSurvey[]>(() => loadSavedSurveys());
  const [progress, setProgress] = useState<TopicSurveyProgress | null>(null);

  useEffect(() => {
    const current = loadCurrentSurvey();
    if (!current) return;
    setSurvey(current);
    setTopic(current.topic);
  }, []);

  // The listener lives for the view's lifetime — we only render progress while
  // the mutation is pending, so stale events between runs are harmless. The
  // unlisten callback prevents a leak when the user navigates away.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let alive = true;
    subscribeTopicSurveyProgress((p) => { if (alive) setProgress(p); })
      .then((fn) => { unlisten = fn; });
    return () => { alive = false; unlisten?.(); };
  }, []);

  const run = useMutation({
    mutationFn: (t: string) => {
      setProgress({ phase: "planning" });
      return api.topicSurvey({ topic: t, annotate });
    },
    onSuccess: (r) => {
      setSurvey(r);
      setProgress(null);
      saveCurrentSurvey(r);
    },
    onError: () => setProgress(null),
  });

  const mustReadPapers = survey
    ? survey.subareas.flatMap((s) => s.papers).filter((p) => p.must_read)
    : [];

  const submit = () => { if (topic.trim()) run.mutate(topic.trim()); };
  const saveSurvey = () => {
    if (!survey) return;
    const next = upsertSavedSurvey(saved, survey);
    setSaved(next);
    persistSavedSurveys(next);
  };
  const deleteSaved = (id: string) => {
    const next = saved.filter((item) => item.id !== id);
    setSaved(next);
    persistSavedSurveys(next);
  };
  const restoreSaved = (item: SavedSurvey) => {
    setSurvey(item.survey);
    setTopic(item.topic);
    saveCurrentSurvey(item.survey);
  };

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2 mb-1">
          <BookOpenText className="h-5 w-5 text-litera-accent" />
          综述生成
        </h1>
        <p className="text-sm text-litera-mute">
          LLM 拆解领域结构 → Semantic Scholar 取真实文献 → LLM 标注必读。所有论文均为真实命中,无 DOI 幻觉。
        </p>
      </header>

      <div className="px-6 py-5 border-b border-litera-line">
        <div className="litera-panel p-5 max-w-4xl">
          <label className="text-xs uppercase tracking-wider text-litera-mute">主题</label>
          <div className="flex gap-2 mt-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="例如:极端超短脉冲激光"
              className="litera-input flex-1"
            />
            <label className="flex items-center gap-1.5 text-sm text-litera-mute border border-litera-line rounded-md px-2.5 cursor-pointer bg-litera-paper">
              <input
                type="checkbox"
                checked={annotate}
                onChange={(e) => setAnnotate(e.target.checked)}
                className="cursor-pointer accent-litera-accent"
              />
              <Sparkles className="h-3.5 w-3.5" /> 标注必读
            </label>
            <button
              onClick={submit}
              disabled={run.isPending || !topic.trim()}
              className="litera-btn-primary disabled:opacity-50"
            >
              {run.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Compass className="h-4 w-4" />}
              {survey ? "重新生成" : "生成综述"}
            </button>
          </div>
          {run.error && (
            <div className="mt-3 text-sm text-red-400/90 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-words whitespace-pre-wrap">{errorMessage(run.error)}</span>
            </div>
          )}
          {run.isPending && progress && <ProgressStepper progress={progress} />}
          <SavedSurveyBar
            saved={saved}
            canSave={!!survey}
            onSave={saveSurvey}
            onRestore={restoreSaved}
            onDelete={deleteSaved}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {survey ? (
          <div className="grid grid-cols-[1fr_280px] gap-6 px-6 py-4">
            <div className="min-w-0">
              <MustReadShortlist papers={mustReadPapers} />
              <div className="space-y-4">
                {survey.subareas.map((s) => (
                  <SubareaCard key={s.name} subarea={s} />
                ))}
              </div>
              <SurveyFooter survey={survey} />
            </div>
            <KeyPiList keyPis={survey.key_pis} />
          </div>
        ) : (
          <EmptyState pending={run.isPending} />
        )}
      </div>
    </section>
  );
}

function SavedSurveyBar({
  saved, canSave, onSave, onRestore, onDelete,
}: {
  saved: SavedSurvey[];
  canSave: boolean;
  onSave: () => void;
  onRestore: (item: SavedSurvey) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <button onClick={onSave} disabled={!canSave} className="litera-btn text-xs disabled:opacity-50">
        <Save className="h-3.5 w-3.5" /> 保存本次综述
      </button>
      {saved.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const item = saved.find((s) => s.id === e.target.value);
            if (item) onRestore(item);
          }}
          className="litera-input text-xs w-56"
        >
          <option value="">恢复已保存综述...</option>
          {saved.map((item) => (
            <option key={item.id} value={item.id}>
              {item.topic} · {new Date(item.savedAt).toLocaleString()}
            </option>
          ))}
        </select>
      )}
      {saved.slice(0, 3).map((item) => (
        <button
          key={item.id}
          onClick={() => onDelete(item.id)}
          className="p-1 text-litera-mute hover:text-red-400"
          title={`删除 ${item.topic}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function loadCurrentSurvey(): TopicSurvey | null {
  try {
    const raw = localStorage.getItem(CURRENT_SURVEY_KEY);
    return raw ? JSON.parse(raw) as TopicSurvey : null;
  } catch {
    return null;
  }
}

function saveCurrentSurvey(survey: TopicSurvey) {
  localStorage.setItem(CURRENT_SURVEY_KEY, JSON.stringify(survey));
}

function loadSavedSurveys(): SavedSurvey[] {
  try {
    const raw = localStorage.getItem(SAVED_SURVEYS_KEY);
    return raw ? JSON.parse(raw) as SavedSurvey[] : [];
  } catch {
    return [];
  }
}

function persistSavedSurveys(items: SavedSurvey[]) {
  localStorage.setItem(SAVED_SURVEYS_KEY, JSON.stringify(items));
}

function upsertSavedSurvey(items: SavedSurvey[], survey: TopicSurvey): SavedSurvey[] {
  const entry: SavedSurvey = {
    id: `${Date.now()}`,
    topic: survey.topic,
    savedAt: Date.now(),
    survey,
  };
  return [entry, ...items].slice(0, 20);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function ProgressStepper({ progress }: { progress: TopicSurveyProgress }) {
  const steps = [
    { phase: "planning", label: "正在让 LLM 拆解领域结构…" },
    { phase: "grounding", label: `正在 Semantic Scholar 取真实文献…${progress.subarea_total ? ` (共 ${progress.subarea_total} 个 subarea)` : ""}` },
    { phase: "annotating", label: "正在让 LLM 标注每篇论文 + 选必读…" },
    { phase: "done", label: "完成" },
  ] as const;
  const activeIdx = steps.findIndex((s) => s.phase === progress.phase);
  return (
    <ol className="mt-3 space-y-1.5 text-xs">
      {steps.map((s, i) => {
        const cls = i === activeIdx
          ? "text-litera-accent"
          : i < activeIdx
            ? "text-litera-mute line-through opacity-70"
            : "text-litera-mute opacity-50";
        const marker = i === activeIdx ? "▶" : i < activeIdx ? "✓" : "○";
        return <li key={s.phase} className={cls}>{marker} {s.label}</li>;
      })}
    </ol>
  );
}

function EmptyState({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <div className="p-12 text-center text-sm text-litera-mute">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }
  return (
    <div className="p-12 text-center text-sm text-litera-mute max-w-md mx-auto">
      <Compass className="h-12 w-12 mx-auto mb-4 opacity-30" />
      <p className="mb-2">输入研究主题,生成结构化综述。</p>
      <p className="text-xs opacity-70">中文输入也可以——会先翻译再检索。整个流程 30–60 秒。</p>
    </div>
  );
}

function SurveyFooter({ survey }: { survey: TopicSurvey }) {
  return (
    <footer className="mt-6 p-3 border-t border-litera-line text-xs text-litera-mute flex flex-wrap gap-4">
      <span>计划: {survey.plan_model} · {survey.plan_tokens} tk</span>
      {survey.annotated && survey.annotate_model
        ? <span>标注: {survey.annotate_model} · {survey.annotate_tokens} tk</span>
        : <span className="italic">本次未标注 — 标注 LLM 调用失败或被关闭</span>}
    </footer>
  );
}
