import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MessagesSquare, Search, Send } from "lucide-react";
import { api, type AskLibraryResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const SOURCE_LIMIT = 8;

export function AskPage() {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskLibraryResult | null>(null);
  const ask = useMutation({
    mutationFn: (q: string) => api.libraryAsk(q, SOURCE_LIMIT),
    onSuccess: (r) => setResult(r),
  });

  function submit() {
    const q = question.trim();
    if (q) ask.mutate(q);
  }

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-litera-accent" />
          {t("ask.title")}
        </h1>
        <p className="text-sm text-litera-mute">
          {t("ask.subtitle")}
        </p>
      </header>

      <AskComposer
        question={question}
        pending={ask.isPending}
        error={ask.error as Error | null}
        onQuestion={setQuestion}
        onSubmit={submit}
      />

      <div className="flex-1 overflow-auto px-6 py-5">
        <AskBody pending={ask.isPending} result={result} />
      </div>
    </section>
  );
}

function AskComposer({
  question, pending, error, onQuestion, onSubmit,
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
      <div className="max-w-4xl flex gap-2">
        <input
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder={t("ask.placeholder")}
          className="litera-input flex-1"
        />
        <button
          onClick={onSubmit}
          disabled={pending || !question.trim()}
          className="litera-btn-primary disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t("ask.submit")}
        </button>
      </div>
      {error && <div className="mt-3 text-sm text-red-400/90 break-all">✕ {error.message}</div>}
    </div>
  );
}

function AskBody({
  pending, result,
}: {
  pending: boolean;
  result: AskLibraryResult | null;
}) {
  if (pending) {
    return (
      <div className="text-sm text-litera-mute flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在让模型改写检索词、召回相关论文并生成回答…
      </div>
    );
  }
  if (result) return <Answer result={result} />;
  return <EmptyState />;
}

function EmptyState() {
  return (
    <div className="h-64 grid place-items-center text-sm text-litera-mute">
      <div className="text-center max-w-md">
        <Search className="h-9 w-9 mx-auto mb-3 opacity-40" />
        <p>输入问题后会先让 LLM 把问题改写成 2-4 个英文检索词,</p>
        <p>在 SQLite FTS5 多路召回并按命中数 + 年份排序,</p>
        <p>再把命中的 TL;DR / 摘要 / 高亮交给模型回答并标注 [N] 引用。</p>
      </div>
    </div>
  );
}

function RetrievalSummary({ result }: { result: AskLibraryResult }) {
  if (!result.terms.length && result.retrieved_count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-litera-mute">检索词</span>
      {result.terms.map((t) => (
        <span
          key={t}
          className="px-2 py-0.5 rounded-full border border-litera-line text-litera-text/80 bg-litera-line/20"
        >
          {t}
        </span>
      ))}
      <span className="ml-auto text-litera-mute">
        召回 {result.retrieved_count} 篇 · {result.model || "—"}
      </span>
    </div>
  );
}

function Answer({ result }: { result: AskLibraryResult }) {
  const empty = result.sources.length === 0;
  return (
    <div className="max-w-6xl">
      <RetrievalSummary result={result} />
      {empty ? (
        <div className="rounded-md border border-litera-line/70 bg-litera-line/10 p-4 text-sm whitespace-pre-wrap leading-relaxed text-litera-text/85">
          {result.answer}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
          <article className="min-w-0">
            <div className="whitespace-pre-wrap leading-relaxed text-sm text-litera-text">
              {result.answer}
            </div>
            <footer className="mt-5 pt-3 border-t border-litera-line text-xs text-litera-mute">
              {result.model} · {result.prompt_tokens + result.completion_tokens} tk · 引用 {result.sources.length} 篇
            </footer>
          </article>
          <aside className="border-l border-litera-line pl-4">
            <h2 className="text-xs uppercase tracking-wider text-litera-mute mb-2">来源</h2>
            <ol className="space-y-3">
              {result.sources.map((source, idx) => (
                <li key={source.paper_id} className="text-xs">
                  <div className="font-medium text-litera-text leading-snug">
                    [{idx + 1}] {source.title}
                  </div>
                  <div className="text-litera-mute mt-0.5">
                    {source.authors.slice(0, 3).join(", ")}
                    {source.authors.length > 3 ? " et al." : ""}
                    {source.year ? ` · ${source.year}` : ""}
                  </div>
                  <p className="text-litera-text/65 mt-1 line-clamp-3 leading-relaxed">
                    {source.snippet}
                  </p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
