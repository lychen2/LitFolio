import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BookOpen, Compass, Layers, Loader2, Sparkles, Trash2,
  Wrench, X,
} from "lucide-react";
import { api, type Paper, type QuickReadResult } from "@/lib/api";
import { errorMessageOr } from "@/lib/error";
import { useI18n } from "@/i18n/I18nProvider";

export function QuickReadDrawer({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: latest } = useQuery({
    queryKey: ["paper", paper.id],
    queryFn: () => api.paperGet(paper.id),
    initialData: paper,
  });
  const current = latest ?? paper;
  const m = useMutation({
    mutationFn: () => api.paperQuickRead(paper.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
      qc.invalidateQueries({ queryKey: ["papers"], refetchType: "active" });
    },
  });
  const del = useMutation({
    mutationFn: () => api.paperDelete(paper.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"], refetchType: "active" });
      onClose();
    },
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const hasCached = hasCachedQuickRead(current);
  const result = cachedQuickRead(current, hasCached) ?? m.data ?? null;

  return (
    <div className="fixed inset-0 z-30 flex items-stretch justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-[92vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col litera-drawer-enter">
        <DrawerHeader paper={current} onClose={onClose} />
        <DrawerToolbar
          hasCached={hasCached}
          modelPending={m.isPending}
          deletePending={del.isPending}
          confirmingDelete={confirmingDelete}
          setConfirmingDelete={setConfirmingDelete}
          onDelete={() => del.mutate()}
          onGenerate={() => m.mutate()}
        />
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          {!result && !m.isPending && <EmptyQuickRead />}
          {m.isPending && !result && <GeneratingQuickRead />}
          {result && <ResultBody r={result} />}
          {m.error && (
            <div className="text-sm text-red-400/90 border border-red-400/30 rounded p-3">
              ✕ {errorMessageOr(m.error, t("reader.unknownError"))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function hasCachedQuickRead(paper: Paper) {
  return !!paper.research_question && !!paper.method && !!paper.comparison && !!paper.limitations;
}

function cachedQuickRead(paper: Paper, hasCached: boolean): QuickReadResult | null {
  if (!hasCached) return null;
  return {
    problem: paper.research_question ?? "",
    method: paper.method ?? "",
    comparison: paper.comparison ?? "",
    limitations: paper.limitations ?? "",
    model: "(cached)",
    prompt_tokens: 0,
    completion_tokens: 0,
  };
}

function DrawerHeader({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-litera-accent2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> {t("library.deepRead")}
        </div>
        <div className="font-serif text-lg leading-snug mt-0.5">{paper.title}</div>
        {paper.title_translated && (
          <div className="text-xs text-litera-accent/90 mt-0.5 italic">
            {t("library.translatedPrefix")} {paper.title_translated}
          </div>
        )}
        <div className="text-xs text-litera-mute mt-1 truncate">
          {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}
          {paper.year ? ` · ${paper.year}` : ""}
          {paper.venue ? ` · ${paper.venue}` : ""}
        </div>
      </div>
      <button onClick={onClose} className="text-litera-mute hover:text-litera-text" aria-label={t("common.close")}>
        <X className="h-5 w-5" />
      </button>
    </header>
  );
}

function DrawerToolbar({
  hasCached, modelPending, deletePending, confirmingDelete, setConfirmingDelete, onDelete, onGenerate,
}: {
  hasCached: boolean;
  modelPending: boolean;
  deletePending: boolean;
  confirmingDelete: boolean;
  setConfirmingDelete: (value: boolean) => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="px-5 py-3 border-b border-litera-line flex items-center justify-between gap-2">
      <div className="text-xs text-litera-mute">
        {hasCached ? t("library.cachedResult") : modelPending ? t("library.callingModel") : t("library.generateDeepRead")}
      </div>
      <div className="flex items-center gap-2">
        <DeleteControl
          confirming={confirmingDelete}
          pending={deletePending}
          setConfirming={setConfirmingDelete}
          onDelete={onDelete}
        />
        <button onClick={onGenerate} disabled={modelPending} className="litera-btn-primary text-xs disabled:opacity-50">
          {modelPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {hasCached ? t("library.regenerate") : t("library.runDeepRead")}
        </button>
      </div>
    </div>
  );
}

function DeleteControl({
  confirming, pending, setConfirming, onDelete,
}: {
  confirming: boolean;
  pending: boolean;
  setConfirming: (value: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="litera-btn text-xs text-red-400/80 hover:text-red-400 disabled:opacity-50"
        title={t("library.deletePaperTitle")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <>
      <span className="text-[11px] text-red-400/90">{t("library.confirmDeletePaper")}</span>
      <button
        onClick={() => { setConfirming(false); onDelete(); }}
        disabled={pending}
        className="litera-btn text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 inline-flex items-center gap-1"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {t("common.delete")}
      </button>
      <button onClick={() => setConfirming(false)} className="litera-btn text-xs">
        {t("common.cancel")}
      </button>
    </>
  );
}

function EmptyQuickRead() {
  const { t } = useI18n();
  return (
    <div className="text-sm text-litera-mute text-center py-12">
      <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
      {t("library.noDeepReadResult", { button: t("library.runDeepRead") })}
      <div className="text-[11px] mt-2">{t("library.needLlmConfig")}</div>
    </div>
  );
}

function GeneratingQuickRead() {
  const { t } = useI18n();
  return (
    <div className="text-sm text-litera-mute flex items-center justify-center gap-2 py-12">
      <Loader2 className="h-4 w-4 animate-spin" /> {t("library.generatingDeepRead")}
    </div>
  );
}

function ResultBody({ r }: { r: QuickReadResult }) {
  const { t } = useI18n();
  return (
    <>
      <Section icon={<Compass className="h-4 w-4" />} label={t("library.resultProblem")} body={r.problem} tone="accent" />
      <Section icon={<Wrench className="h-4 w-4" />} label={t("library.resultMethod")} body={r.method} tone="accent" />
      <Section icon={<Layers className="h-4 w-4" />} label={t("library.resultComparison")} body={r.comparison} tone="accent2" />
      <Section icon={<AlertTriangle className="h-4 w-4" />} label={t("library.resultLimitations")} body={r.limitations} tone="warn" />
      {r.model && r.model !== "(cached)" && (
        <div className="text-[11px] text-litera-mute pt-2 border-t border-litera-line">
          model: <span className="font-mono">{r.model}</span>
          {" · "}prompt tokens: {r.prompt_tokens}
          {" · "}completion tokens: {r.completion_tokens}
        </div>
      )}
    </>
  );
}

function Section({
  icon, label, body, tone,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
  tone: "accent" | "accent2" | "warn";
}) {
  const color = tone === "accent" ? "text-litera-accent" : tone === "accent2" ? "text-litera-accent2" : "text-amber-400";
  return (
    <div>
      <div className={"flex items-center gap-1.5 text-xs uppercase tracking-wider mb-1.5 " + color}>
        {icon} {label}
      </div>
      <div className="text-sm leading-relaxed text-litera-text whitespace-pre-line">
        {body || <span className="text-litera-mute italic">(empty)</span>}
      </div>
    </div>
  );
}
