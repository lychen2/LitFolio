import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BookOpen, Compass, Layers, Spinner, Sparkles,
  Wrench,
  XCircle,
} from "@/components/icons";
import { api, type Paper, type QuickReadResult } from "@/lib/api";
import { errorMessageOr } from "@/lib/error";
import { useI18n } from "@/i18n/I18nProvider";
import { DetailDrawer } from "@/components/DetailDrawer";

export function QuickReadDrawer({ paper, onClose, notification }: { paper: Paper; onClose: () => void; notification?: ReactNode }) {
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
  const hasCached = hasCachedQuickRead(current);
  const result = cachedQuickRead(current, hasCached) ?? m.data ?? null;

  return (
    <DetailDrawer
      label={t("reader.tabNotes")}
      heading={<QuickReadHeading paper={current} />}
      size="compact"
      onClose={onClose}
      notification={notification}
      actions={
        <DrawerToolbar
          hasCached={hasCached}
          modelPending={m.isPending}
          onGenerate={() => m.mutate()}
        />
      }
    >
      {!result && !m.isPending && <EmptyQuickRead />}
      {m.isPending && !result && <GeneratingQuickRead />}
      {result && <ResultBody r={result} />}
      {m.error && (
        <div className="text-sm text-litera-error border border-litera-error/30 rounded p-3">
          <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{errorMessageOr(m.error, t("reader.unknownError"))}
        </div>
      )}
    </DetailDrawer>
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

function QuickReadHeading({ paper }: { paper: Paper }) {
  const { t } = useI18n();
  return (
    <>
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
    </>
  );
}

function DrawerToolbar({
  hasCached, modelPending, onGenerate,
}: {
  hasCached: boolean;
  modelPending: boolean;
  onGenerate: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="px-5 py-3 border-b border-litera-line flex items-center justify-between gap-2">
      <div className="text-xs text-litera-mute">
        {hasCached ? t("library.cachedResult") : modelPending ? t("library.callingModel") : t("library.generateDeepRead")}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onGenerate} disabled={modelPending} className="litera-btn-primary text-xs disabled:opacity-50">
          {modelPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {hasCached ? t("library.regenerate") : t("library.runDeepRead")}
        </button>
      </div>
    </div>
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
      <Spinner className="h-4 w-4 animate-spin" /> {t("library.generatingDeepRead")}
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
  const color = tone === "accent" ? "text-litera-accent" : tone === "accent2" ? "text-litera-accent2" : "text-litera-warn";
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
