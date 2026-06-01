import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  BookMarked, FileText, LibraryBig, Loader2, MessagesSquare, Search, User, Bot,
} from "lucide-react";
import { api, type AskLibraryResult, type AskSource, type ResearchProject } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { MarkdownView } from "@/components/MarkdownView";
import { WorkflowCard } from "./ask/WorkflowCard";
import { AskComposer, type PinnedPaper } from "./ask/AskComposer";

const SOURCE_LIMIT = 8;

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  result?: AskLibraryResult;
}

export function AskPage() {
  const t = useT();
  const [params] = useSearchParams();
  const projectIdParam = Number(params.get("projectId"));
  const scopedProjectId = Number.isFinite(projectIdParam) && projectIdParam > 0 ? projectIdParam : null;
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [pinnedPapers, setPinnedPapers] = useState<PinnedPaper[]>([]);
  const [evidenceProjectId, setEvidenceProjectId] = useState<number | "">("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
  });
  const projectPapers = useQuery({
    queryKey: ["projects", scopedProjectId, "papers"],
    queryFn: () => api.projectPapersList(scopedProjectId!),
    enabled: scopedProjectId != null,
  });
  const scopedProject = projects.data?.find((project) => project.id === scopedProjectId) ?? null;

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    if (scopedProjectId == null || !projectPapers.data) return;
    setPinnedPapers(projectPapers.data.map((paper) => ({
      id: paper.id,
      title: paper.title,
      year: paper.year,
    })));
    setEvidenceProjectId(scopedProjectId);
  }, [projectPapers.data, scopedProjectId]);

  const ask = useMutation({
    mutationFn: ({ question, pinnedIds }: { question: string; pinnedIds: string[] }) => {
      // Build conversation history for the API
      const history = conversation.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));
      return api.libraryAsk(question, SOURCE_LIMIT, history, pinnedIds);
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
  const addEvidence = useMutation({
    mutationFn: (params: { question: string; result: AskLibraryResult }) => {
      if (evidenceProjectId === "") throw new Error("Project is required");
      const firstSource = params.result.sources[0] ?? null;
      return api.evidenceAdd(evidenceProjectId, {
        source_type: "ask",
        paper_id: firstSource?.paper_id ?? null,
        highlight_id: null,
        page: null,
        label: "ask",
        excerpt: params.result.answer,
        note: params.question,
      });
    },
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
      <header className="border-b border-litera-line px-6 py-5">
        <div className="max-w-6xl flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-litera-accent" />
              {t("ask.title")}
            </h1>
            <p className="mt-1 text-sm text-litera-mute">{t("ask.subtitle")}</p>
            {scopedProject && (
              <div className="mt-2 inline-flex rounded border border-litera-line px-2 py-1 text-xs text-litera-mute">
                {t("ask.projectScope", { name: scopedProject.name })}
              </div>
            )}
          </div>
          {hasConversation && (
            <button
              onClick={clearConversation}
              className="text-xs text-litera-mute hover:text-litera-text px-3 py-1.5 rounded-md border border-litera-line hover:bg-litera-panel"
            >
              {t("ask.clearConversation")}
            </button>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {!hasConversation ? (
          <EmptyState />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {conversation.map((turn, index) => (
              <div key={index} className="flex gap-3">
                <div className="shrink-0 mt-1">
                  {turn.role === "user" ? (
                    <div className="h-8 w-8 rounded-full bg-litera-accent/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-litera-accent" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-emerald-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-litera-mute mb-1">
                    {turn.role === "user" ? t("ask.you") : t("ask.assistant")}
                  </div>
                  <div className="litera-panel p-4">
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
                            {turn.result.model || "—"} · {turn.result.prompt_tokens + turn.result.completion_tokens} tk · {t("ask.citationCount", { count: turn.result.sources.length })}
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
                        <AskEvidenceControls
                          projects={projects.data ?? []}
                          projectId={evidenceProjectId}
                          isSaving={addEvidence.isPending}
                          saved={addEvidence.isSuccess}
                          onProjectChange={setEvidenceProjectId}
                          onAdd={() => {
                            const turnIndex = conversation.indexOf(turn);
                            const question = turnIndex > 0 ? conversation[turnIndex - 1].content : "";
                            addEvidence.mutate({ question, result: turn.result! });
                          }}
                        />
                        {addEvidence.error && (
                          <div className="mt-2 text-xs text-red-400/90">{(addEvidence.error as Error).message}</div>
                        )}
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
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-litera-mute mb-1">{t("ask.assistant")}</div>
                  <div className="litera-panel p-4">
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
      <div className="border-t border-litera-line px-6 py-4">
        <div className="max-w-4xl mx-auto">
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

function AskEvidenceControls({
  projects,
  projectId,
  isSaving,
  saved,
  onProjectChange,
  onAdd,
}: {
  projects: ResearchProject[];
  projectId: number | "";
  isSaving: boolean;
  saved: boolean;
  onProjectChange: (id: number | "") => void;
  onAdd: () => void;
}) {
  const t = useT();
  if (projects.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-litera-mute">
      <span>{t("ask.evidenceProject")}</span>
      <select
        value={projectId}
        onChange={(event) => onProjectChange(event.target.value ? Number(event.target.value) : "")}
        className="litera-input py-1 text-xs"
      >
        <option value="">{t("common.none")}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
      <button
        onClick={onAdd}
        disabled={isSaving || projectId === ""}
        className="litera-btn text-xs disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />}
        {t("ask.addEvidence")}
      </button>
      {saved && <span className="text-emerald-400">{t("ask.evidenceAdded")}</span>}
    </div>
  );
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
        {sources.slice(0, 4).map((source, index) => (
          <div key={`${source.paper_id}-${index}`} className="rounded-md bg-litera-panel/60 px-2.5 py-2">
            <div className="text-xs font-medium text-litera-text truncate">
              [{index + 1}] {source.title}
            </div>
            <div className="mt-0.5 text-[11px] text-litera-mute">
              {formatSourceMeta(source)}
            </div>
          </div>
        ))}
      </div>
      {sources.length > 4 && (
        <div className="text-[11px] text-litera-mute">
          +{sources.length - 4} {t("ask.moreSources")}
        </div>
      )}
    </div>
  );
}

function formatSourceMeta(source: AskSource): string {
  const authors = source.authors.slice(0, 2).join(", ");
  const authorLabel = source.authors.length > 2 ? `${authors} et al.` : authors;
  return [authorLabel, source.year ?? null].filter(Boolean).join(" · ");
}
