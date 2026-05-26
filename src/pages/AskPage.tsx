import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BookMarked, Check, FileText, LibraryBig, Loader2, MessagesSquare, Search, Send,
} from "lucide-react";
import { api, type AskLibraryResult, type AskSource } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { WorkflowCard } from "./ask/WorkflowCard";

const SOURCE_LIMIT = 8;

export function AskPage() {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [result, setResult] = useState<AskLibraryResult | null>(null);

  const ask = useMutation({
    mutationFn: (nextQuestion: string) => api.libraryAsk(nextQuestion, SOURCE_LIMIT),
    onSuccess: (nextResult, nextQuestion) => {
      setAskedQuestion(nextQuestion);
      setResult(nextResult);
    },
  });

  const save = useMutation({
    mutationFn: (nextResult: AskLibraryResult) =>
      api.askSaveAsNote({
        question: askedQuestion,
        answer: nextResult.answer,
        terms: nextResult.terms,
        sources: nextResult.sources,
        model: nextResult.model,
      }),
  });

  function submit() {
    const nextQuestion = question.trim();
    if (!nextQuestion) return;
    save.reset();
    ask.mutate(nextQuestion);
  }

  function saveNote() {
    if (!result || !askedQuestion) return;
    save.mutate(result);
  }

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-5">
        <div className="max-w-6xl">
          <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-litera-accent" />
            {t("ask.title")}
          </h1>
          <p className="mt-1 text-sm text-litera-mute">{t("ask.subtitle")}</p>
        </div>
      </header>

      <AskComposer
        question={question}
        pending={ask.isPending}
        error={ask.error as Error | null}
        onQuestion={setQuestion}
        onSubmit={submit}
      />

      <div className="flex-1 overflow-auto px-6 py-5">
        <AskBody
          askedQuestion={askedQuestion}
          pending={ask.isPending}
          result={result}
          saveError={save.error as Error | null}
          savePath={save.data?.path ?? null}
          saving={save.isPending}
          onSave={saveNote}
        />
      </div>
    </section>
  );
}

function AskComposer({
  question,
  pending,
  error,
  onQuestion,
  onSubmit,
}: {
  question: string;
  pending: boolean;
  error: Error | null;
  onQuestion: (value: string) => void;
  onSubmit: () => void;
}) {
  const t = useT();
  return (
    <div className="border-b border-litera-line px-6 py-5">
      <div className="max-w-6xl">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <label className="litera-panel p-3">
            <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">
              {t("ask.inputLabel")}
            </div>
            <textarea
              value={question}
              onChange={(e) => onQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
              }}
              placeholder={t("ask.placeholder")}
              className="min-h-28 w-full resize-none bg-transparent text-sm leading-relaxed text-litera-text outline-none placeholder:text-litera-mute"
            />
            <div className="mt-2 text-[11px] text-litera-mute">{t("ask.inputHint")}</div>
          </label>
          <div className="litera-panel p-3 flex flex-col justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">
                {t("ask.workflowTitle")}
              </div>
              <p className="text-sm text-litera-text/85 leading-relaxed">
                {t("ask.workflowBody")}
              </p>
            </div>
            <button
              onClick={onSubmit}
              disabled={pending || !question.trim()}
              className="litera-btn-primary justify-center disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("ask.submit")}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-400/90 break-all">✕ {error.message}</div>}
      </div>
    </div>
  );
}

function AskBody({
  askedQuestion,
  pending,
  result,
  saving,
  saveError,
  savePath,
  onSave,
}: {
  askedQuestion: string;
  pending: boolean;
  result: AskLibraryResult | null;
  saving: boolean;
  saveError: Error | null;
  savePath: string | null;
  onSave: () => void;
}) {
  const t = useT();
  if (pending) {
    return (
      <div className="text-sm text-litera-mute flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("ask.searching")}
      </div>
    );
  }
  if (result) {
    return (
      <AnswerPanel
        askedQuestion={askedQuestion}
        result={result}
        saveError={saveError}
        savePath={savePath}
        saving={saving}
        onSave={onSave}
      />
    );
  }
  return (
    <div className="h-full grid place-items-center">
      <div className="max-w-3xl grid gap-4 lg:grid-cols-2">
        <WorkflowCard variant="wide" icon={<Search className="h-5 w-5" />} title={t("ask.empty.card1Title")} body={t("ask.empty.card1Body")} />
        <WorkflowCard icon={<LibraryBig className="h-5 w-5" />} title={t("ask.empty.card2Title")} body={t("ask.empty.card2Body")} />
        <WorkflowCard icon={<BookMarked className="h-5 w-5" />} title={t("ask.empty.card3Title")} body={t("ask.empty.card3Body")} />
      </div>
    </div>
  );
}

function AnswerPanel({
  askedQuestion,
  result,
  saving,
  saveError,
  savePath,
  onSave,
}: {
  askedQuestion: string;
  result: AskLibraryResult;
  saving: boolean;
  saveError: Error | null;
  savePath: string | null;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="max-w-6xl grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <article className="min-w-0 space-y-4">
        <section className="litera-panel p-4">
          <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("ask.questionTitle")}</div>
          <p className="text-sm text-litera-text leading-relaxed">{askedQuestion}</p>
        </section>
        <section className="litera-panel p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-xs uppercase tracking-wider text-litera-mute">{t("ask.answerTitle")}</div>
            <button
              onClick={onSave}
              disabled={saving}
              className="litera-btn text-xs disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {t("ask.save")}
            </button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-litera-text">{result.answer}</div>
          <footer className="mt-4 pt-3 border-t border-litera-line text-xs text-litera-mute">
            {result.model || "—"} · {result.prompt_tokens + result.completion_tokens} tk · {t("ask.citationCount", { count: result.sources.length })}
          </footer>
          {savePath && (
            <div className="mt-3 text-xs text-emerald-300 flex items-start gap-1.5 break-all">
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {t("ask.savedTo", { path: savePath })}
            </div>
          )}
          {saveError && <div className="mt-3 text-xs text-red-400/90 break-all">✕ {saveError.message}</div>}
        </section>
      </article>
      <aside className="space-y-4">
        <EvidenceSummary result={result} />
        <EvidenceList sources={result.sources} />
      </aside>
    </div>
  );
}

function EvidenceSummary({ result }: { result: AskLibraryResult }) {
  const t = useT();
  return (
    <section className="litera-panel p-4">
      <div className="text-xs uppercase tracking-wider text-litera-mute mb-3">{t("ask.evidenceTitle")}</div>
      <div className="flex flex-wrap gap-2">
        {result.terms.map((term) => (
          <span
            key={term}
            className="px-2 py-0.5 rounded-full border border-litera-line bg-litera-line/20 text-xs text-litera-text/80"
          >
            {term}
          </span>
        ))}
      </div>
      <div className="mt-3 text-xs text-litera-mute">
        {t("ask.retrievedCount", { count: result.retrieved_count })}
      </div>
    </section>
  );
}

function EvidenceList({ sources }: { sources: AskSource[] }) {
  const t = useT();
  return (
    <section className="litera-panel p-4">
      <div className="text-xs uppercase tracking-wider text-litera-mute mb-3">{t("ask.sources")}</div>
      <ol className="space-y-4">
        {sources.map((source, index) => (
          <li key={`${source.paper_id}-${index}`} className="text-xs">
            <div className="font-medium text-litera-text leading-snug">
              [{index + 1}] {source.title}
            </div>
            <div className="mt-1 text-litera-mute leading-relaxed">
              {formatSourceMeta(source)}
            </div>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-litera-text/70">
              {source.snippet}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatSourceMeta(source: AskSource): string {
  const authors = source.authors.slice(0, 3).join(", ");
  const authorLabel = source.authors.length > 3 ? `${authors} et al.` : authors;
  return [authorLabel, source.year ?? null].filter(Boolean).join(" · ");
}
