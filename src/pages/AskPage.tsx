import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  BookMarked, FileText, LibraryBig, Loader2, MessagesSquare, Search, User, Bot,
} from "lucide-react";
import { api, type AskCapabilityKind, type AskCapabilityState, type AskLibraryResult, type AskSource, type ResearchProject, type SaveAskNoteResult } from "@/lib/api";
import { type TKey } from "@/i18n/dict";
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [savedArtifacts, setSavedArtifacts] = useState<unknown[]>([]);
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
  const capability = useQuery({
    queryKey: ["ask", "capability"],
    queryFn: api.askCapabilityState,
    refetchInterval: 30000,
  });
  const session = useQuery({
    queryKey: ["ask", "session", scopedProjectId],
    queryFn: () => api.askSessionLatest(scopedProjectId),
  });
  const scopedProject = projects.data?.find((project) => project.id === scopedProjectId) ?? null;

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    setSessionHydrated(false);
    setSessionId(null);
    setConversation([]);
    setPinnedPapers([]);
    setSavedArtifacts([]);
  }, [scopedProjectId]);

  const saveSession = useMutation({
    mutationFn: () => api.askSessionSave({
      id: sessionId,
      project_id: evidenceProjectId === "" ? scopedProjectId : evidenceProjectId,
      title: sessionTitle(conversation),
      pinned_paper_ids: pinnedPapers.map((paper) => paper.id),
      model: latestModel(conversation),
      conversation,
      saved_artifacts: savedArtifacts,
    }),
    onSuccess: (saved) => setSessionId(saved.id),
  });

  useEffect(() => {
    if (!session.isSuccess) return;
    const current = session.data;
    if (!current) {
      setSessionHydrated(true);
      return;
    }
    setSessionId(current.id);
    setConversation(parseSessionConversation(current.conversation));
    setSavedArtifacts(Array.isArray(current.saved_artifacts) ? current.saved_artifacts : []);
    setEvidenceProjectId(current.project_id ?? "");
    let cancelled = false;
    Promise.all(current.pinned_paper_ids.map((id) => api.paperGet(id)))
      .then((papers) => {
        if (cancelled) return;
        setPinnedPapers(papers.filter((paper) => paper != null).map((paper) => ({
          id: paper.id,
          title: paper.title,
          year: paper.year,
        })));
      })
      .finally(() => {
        if (!cancelled) setSessionHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.data, session.isSuccess]);

  useEffect(() => {
    if (!sessionHydrated || session.data || scopedProjectId == null || !projectPapers.data) return;
    setPinnedPapers(projectPapers.data.map((paper) => ({
      id: paper.id,
      title: paper.title,
      year: paper.year,
    })));
    setEvidenceProjectId(scopedProjectId);
  }, [projectPapers.data, scopedProjectId, session.data, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated) return;
    if (conversation.length === 0 && pinnedPapers.length === 0 && savedArtifacts.length === 0) return;
    const handle = window.setTimeout(() => saveSession.mutate(), 500);
    return () => window.clearTimeout(handle);
  }, [conversation, evidenceProjectId, pinnedPapers, savedArtifacts, scopedProjectId, sessionHydrated]);

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
    onSuccess: (result: SaveAskNoteResult) => {
      setSavedArtifacts((prev) => [...prev, { type: "ask_note", path: result.path }]);
    },
  });
  const addEvidence = useMutation({
    mutationFn: (params: { question: string; result: AskLibraryResult; source?: AskSource }) => {
      if (evidenceProjectId === "") throw new Error("Project is required");
      const source = params.source ?? params.result.sources[0] ?? null;
      return api.evidenceAdd(evidenceProjectId, {
        source_type: "ask",
        paper_id: source?.paper_id ?? null,
        highlight_id: null,
        page: null,
        label: params.source ? "ask-source" : "ask",
        excerpt: source?.snippet ?? params.result.answer,
        note: params.question,
      });
    },
    onSuccess: (result) => {
      setSavedArtifacts((prev) => [...prev, { type: "evidence", id: result.id }]);
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
    setSavedArtifacts([]);
    setSessionId(null);
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
            {capability.data && (
              <AskCapabilityBadge capability={capability.data} />
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
                            const question = questionBeforeTurn(conversation, turn);
                            addEvidence.mutate({ question, result: turn.result! });
                          }}
                        />
                        {addEvidence.error && (
                          <div className="mt-2 text-xs text-red-400/90">{(addEvidence.error as Error).message}</div>
                        )}
                        {turn.result.sources.length > 0 && (
                          <div className="mt-3">
                            <SourcesInline
                              sources={turn.result.sources}
                              canSave={evidenceProjectId !== ""}
                              isSaving={addEvidence.isPending}
                              onSave={(source) => {
                                const question = questionBeforeTurn(conversation, turn);
                                addEvidence.mutate({ question, result: turn.result!, source });
                              }}
                            />
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

function parseSessionConversation(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((turn): turn is ConversationTurn => {
    if (!turn || typeof turn !== "object") return false;
    const candidate = turn as Partial<ConversationTurn>;
    return (candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string";
  });
}

function sessionTitle(conversation: ConversationTurn[]): string {
  const firstQuestion = conversation.find((turn) => turn.role === "user")?.content.trim();
  return firstQuestion ? firstQuestion.slice(0, 120) : "Untitled Ask session";
}

function latestModel(conversation: ConversationTurn[]): string | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const model = conversation[index].result?.model;
    if (model) return model;
  }
  return null;
}

function AskCapabilityBadge({ capability }: { capability: AskCapabilityState }) {
  const t = useT();
  const stateClass = capability.state === "answer_ready"
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : capability.state === "degraded"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : "border-litera-line bg-litera-panel/70 text-litera-mute";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className={`rounded border px-2 py-1 ${stateClass}`}>
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

function SourcesInline({
  sources,
  canSave,
  isSaving,
  onSave,
}: {
  sources: AskSource[];
  canSave: boolean;
  isSaving: boolean;
  onSave: (source: AskSource) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-litera-mute">{t("ask.sources")}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.slice(0, SOURCE_LIMIT).map((source, index) => (
          <div key={`${source.paper_id}-${index}`} className="rounded-md bg-litera-panel/60 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-litera-text">
                  [{index + 1}] {source.title}
                </div>
                <div className="mt-0.5 text-[11px] text-litera-mute">
                  {formatSourceMeta(source)}
                </div>
              </div>
              <button
                onClick={() => onSave(source)}
                disabled={!canSave || isSaving}
                className="shrink-0 rounded border border-litera-line px-1.5 py-0.5 text-[11px] text-litera-mute hover:text-litera-text disabled:opacity-40"
                title={canSave ? t("ask.sourceSaveEvidence") : t("ask.sourcePickProject")}
              >
                {t("ask.sourceSave")}
              </button>
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

function questionBeforeTurn(conversation: ConversationTurn[], turn: ConversationTurn): string {
  const turnIndex = conversation.indexOf(turn);
  return turnIndex > 0 ? conversation[turnIndex - 1].content : "";
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
