import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookMarked, FileText, LibraryBig, Loader2, MessagesSquare, Search, User, Bot,
} from "lucide-react";
import { api, type AskCapabilityKind, type AskCapabilityState, type AskLibraryResult, type AskSource } from "@/lib/api";

import { type TKey } from "@/i18n/dict";
import { useT } from "@/i18n/I18nProvider";
import { MarkdownView } from "@/components/MarkdownView";
import { PageHeader } from "@/components/PageHeader";
import { WorkflowCard } from "./WorkflowCard";
import { AskComposer, type PinnedPaper } from "./AskComposer";

export function askSourceReaderHref(source: { paper_id: string }): string | null {
  return source.paper_id ? `/reader/${source.paper_id}` : null;
}

export function summarizeAskContext(result: { sources: AskSource[] }): {
  papers: number;
  highlights: number;
  documents: number;
} {
  const papers = new Set<string>();
  let highlights = 0;
  let documents = 0;
  for (const source of result.sources) {
    if (source.paper_id) papers.add(source.paper_id);
    const lines = source.snippet.split("\n");
    for (const line of lines) {
      if (line.startsWith("Highlight:")) highlights += 1;
      if (line.startsWith("Document Markdown:")) documents += 1;
    }
  }
  return { papers: papers.size, highlights, documents };
}

const SOURCE_LIMIT = 8;
const ASK_RETRIEVAL_LIMIT = 24;

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  result?: AskLibraryResult;
}

export function AskPage() {
  const t = useT();
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [pinnedPapers, setPinnedPapers] = useState<PinnedPaper[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const capability = useQuery({
    queryKey: ["ask", "capability"],
    queryFn: api.askCapabilityState,
    refetchInterval: 30000,
  });
  const session = useQuery({
    queryKey: ["ask", "session"],
    queryFn: () => api.askSessionLatest(null),
  });

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    setConversation([]);
    setPinnedPapers([]);
  }, []);

  useEffect(() => {
    if (!session.isSuccess) return;
    const current = session.data;
    if (!current) {
      return;
    }
    setConversation(parseSessionConversation(current.conversation));
    let cancelled = false;
    Promise.all(current.pinned_paper_ids.map((id) => api.paperGet(id)))
      .then((papers) => {
        if (cancelled) return;
        setPinnedPapers(papers.filter((paper) => paper != null).map((paper) => ({
          id: paper.id,
          title: paper.title,
          year: paper.year,
        })));
      });
    return () => {
      cancelled = true;
    };
  }, [session.data, session.isSuccess]);

  const ask = useMutation({
    mutationFn: ({ question, pinnedIds }: { question: string; pinnedIds: string[] }) => {
      // Build conversation history for the API
      const history = conversation.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));
      return api.libraryAsk(question, ASK_RETRIEVAL_LIMIT, history, pinnedIds);
    },
    onSuccess: (nextResult, vars) => {
      setConversation((prev) => [
        ...prev,
        { role: "user", content: vars.question },
        { role: "assistant", content: nextResult.answer, result: nextResult },
      ]);
    },
  });

  const save = useMutation({
    mutationFn: (params: { question: string; result: AskLibraryResult }) =>
      api.askSaveAsNote({
        question: params.question,
        answer: params.result.answer,
        terms: params.result.terms,
        sources: params.result.sources,
        model: params.result.model,
      }),
  });

  function handleSubmit(question: string, pinnedIds: string[]) {
    // Clear stale error from a previous failed mutation so the ✕ banner
    // doesn't linger across follow-up attempts.
    ask.reset();
    ask.mutate({ question, pinnedIds });
  }

  function saveNote(turn: ConversationTurn) {
    if (!turn.result) return;
    // Find the user question that preceded this response
    const turnIndex = conversation.indexOf(turn);
    const userQuestion = turnIndex > 0 ? conversation[turnIndex - 1].content : "";
    save.mutate({ question: userQuestion, result: turn.result });
  }

  function clearConversation() {
    setConversation([]);
    setPinnedPapers([]);
    ask.reset();
  }

  const hasConversation = conversation.length > 0;

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <PageHeader
        icon={<MessagesSquare className="h-5 w-5 text-litera-accent" aria-hidden="true" />}
        title={t("ask.title")}
        subtitle={t("ask.subtitle")}
        actions={hasConversation ? (
          <button onClick={clearConversation} className="litera-btn text-xs" title={t("ask.clearConversation")}>
            {t("ask.clearConversation")}
          </button>
        ) : undefined}
      />
      {(capability.data) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-litera-border bg-litera-surface/35 px-5 py-2 text-xs">
          {capability.data && <AskCapabilityBadge capability={capability.data} />}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-5 py-5 max-[900px]:px-3">
        {!hasConversation ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-4xl space-y-7">
            {conversation.map((turn, index) => (
              <div key={index} className="flex gap-3">
                <div className="shrink-0 mt-1">
                  {turn.role === "user" ? (
                    <div className="h-8 w-8 rounded-full bg-litera-accent/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-litera-accent" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-litera-info/12">
                      <Bot className="h-4 w-4 text-litera-info" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-litera-mute mb-1">
                    {turn.role === "user" ? t("ask.you") : t("ask.assistant")}
                  </div>
                  <div className={turn.role === "user" ? "border-l-2 border-litera-accent/60 pl-4" : "border-l-2 border-litera-border pl-4"}>
                    {turn.role === "user" ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-litera-text">
                        {turn.content}
                      </div>
                    ) : (
                      <MarkdownView
                        content={turn.content}
                        className="text-sm leading-relaxed text-litera-text prose-a:text-litera-accent"
                      />
                    )}
                    {turn.result && (
                      <div className="mt-4 pt-3 border-t border-litera-line">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-litera-mute">
                            {turn.result.model || "—"} · {turn.result.prompt_tokens + turn.result.completion_tokens} tk · {t("ask.contextSummary", summarizeAskContext(turn.result))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveNote(turn)}
                              disabled={save.isPending}
                              className="litera-btn text-xs disabled:opacity-60"
                            >
                              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                              {t("ask.save")}
                            </button>
                          </div>
                        </div>
                        {turn.result.sources.length > 0 && (
                          <div className="mt-3">
                            <SourcesInline sources={turn.result.sources} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {ask.isPending && (
              <div className="flex gap-3">
                <div className="shrink-0 mt-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-litera-info/12">
                    <Bot className="h-4 w-4 text-litera-info" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-litera-mute mb-1">{t("ask.assistant")}</div>
                  <div className="border-l-2 border-litera-border pl-4">
                    <div className="flex items-center gap-2 text-sm text-litera-mute">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("ask.searching")}
                    </div>
                  </div>
                </div>
              </div>

            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-litera-border bg-litera-paper/80 px-5 py-4 max-[900px]:px-3">
        <div className="mx-auto max-w-4xl">
          <AskComposer
            onSubmit={handleSubmit}
            isPending={ask.isPending}
            errorMessage={ask.error ? (ask.error as Error).message : null}
            pinnedPapers={pinnedPapers}
            setPinnedPapers={setPinnedPapers}
            placeholder={hasConversation ? t("ask.followUpPlaceholder") : t("ask.placeholder")}
          />
        </div>
      </div>
    </section>
  );
}

function parseSessionConversation(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((turn): turn is ConversationTurn => {
    if (!turn || typeof turn !== "object") return false;
    const candidate = turn as Partial<ConversationTurn>;
    return (candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string";
  });
}

function AskCapabilityBadge({ capability }: { capability: AskCapabilityState }) {
  const t = useT();
  const stateClass = capability.state === "answer_ready"
    ? "border-litera-success/40 bg-litera-success/10 text-litera-success"
    : capability.state === "degraded"
      ? "border-litera-warn/40 bg-litera-warn/10 text-litera-warn"
      : "border-litera-border bg-litera-surface2 text-litera-mute";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`litera-status rounded border px-2 py-1 ${stateClass}`}>
        {t(askCapabilityKey(capability.state))}
      </span>
      <span className="text-litera-mute">
        {t("ask.capability.detail", {
          indexed: capability.indexed_documents,
          total: capability.total_documents,
          failed: capability.failed_documents,
        })}
      </span>
    </div>
  );
}

function askCapabilityKey(state: AskCapabilityKind): TKey {
  switch (state) {
    case "search_only":
      return "ask.capability.search_only";
    case "needs_model":
      return "ask.capability.needs_model";
    case "answer_ready":
      return "ask.capability.answer_ready";
    case "indexing":
      return "ask.capability.indexing";
    case "degraded":
      return "ask.capability.degraded";
  }
  return "ask.capability.needs_model";
}

function EmptyState() {
  const t = useT();
  return (
    <div className="h-full grid place-items-center">
      <div className="max-w-3xl grid gap-4 lg:grid-cols-2 litera-stagger">
        <WorkflowCard variant="wide" icon={<Search className="h-5 w-5" />} title={t("ask.empty.card1Title")} body={t("ask.empty.card1Body")} />
        <WorkflowCard icon={<LibraryBig className="h-5 w-5" />} title={t("ask.empty.card2Title")} body={t("ask.empty.card2Body")} />
        <WorkflowCard icon={<BookMarked className="h-5 w-5" />} title={t("ask.empty.card3Title")} body={t("ask.empty.card3Body")} />
      </div>
    </div>
  );
}

function SourcesInline({ sources }: { sources: AskSource[] }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-litera-mute">{t("ask.sources")}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.slice(0, SOURCE_LIMIT).map((source, index) => (
          <div key={`${source.paper_id}-${index}`} className="rounded-md bg-litera-panel/60 px-2.5 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-litera-text">
                {askSourceReaderHref(source) ? (
                  <Link
                    to={askSourceReaderHref(source)!}
                    className="hover:text-litera-accent"
                  >
                    [{index + 1}] {source.title}
                  </Link>
                ) : (
                  <>[{index + 1}] {source.title}</>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-litera-mute">
                {formatSourceMeta(source)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {sourceFieldLabels(source.snippet).map((label) => (
                <span key={label} className="rounded bg-litera-bg/70 px-1.5 py-0.5 text-[10px] text-litera-mute">
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-litera-mute">
              {source.snippet}
            </p>
          </div>
        ))}
      </div>
      {sources.length > SOURCE_LIMIT && (
        <div className="text-[11px] text-litera-mute">
          +{sources.length - SOURCE_LIMIT} {t("ask.moreSources")}
        </div>
      )}
    </div>
  );
}

function sourceFieldLabels(snippet: string): string[] {
  const labels = snippet
    .split("\n")
    .map((line) => line.slice(0, line.indexOf(":")))
    .filter((label) => label.length > 0 && label.length <= 32);
  return Array.from(new Set(labels)).slice(0, 4);
}
function formatSourceMeta(source: AskSource): string {
  const authors = source.authors.slice(0, 2).join(", ");
  const authorLabel = source.authors.length > 2 ? `${authors} et al.` : authors;
  return [authorLabel, source.year ?? null].filter(Boolean).join(" · ");
}
