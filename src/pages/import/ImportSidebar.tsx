import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  LibraryBig,
  ListPlus,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, type Paper, type ResearchProject } from "@/lib/api";
import { errorMessageOr } from "@/lib/error";
import { useT } from "@/i18n/I18nProvider";
import { RECENT_IMPORTS_CHANGED_EVENT } from "./recentImports";

type ProjectSelection = number | "";
type ActionMessage = { kind: "ok" | "err"; text: string } | null;

export function ImportSidebar() {
  const t = useT();
  const recent = useQuery({
    queryKey: ["papers", "recent", "import-sidebar"],
    queryFn: () => api.papersRecent(6),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
    staleTime: 30_000,
  });
  const refetchRecent = recent.refetch;

  useEffect(() => {
    function refreshRecentImports() {
      void refetchRecent();
    }

    window.addEventListener(RECENT_IMPORTS_CHANGED_EVENT, refreshRecentImports);
    return () =>
      window.removeEventListener(
        RECENT_IMPORTS_CHANGED_EVENT,
        refreshRecentImports
      );
  }, [refetchRecent]);

  return (
    <aside>
      <section className="litera-panel p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wider text-litera-mute">
          <LibraryBig className="h-3.5 w-3.5 text-litera-accent" />
          {t("import.sidebar.recent")}
        </div>
        {recent.isLoading ? (
          <div className="text-xs text-litera-mute">
            {t("import.sidebar.recentLoading")}
          </div>
        ) : !recent.data || recent.data.length === 0 ? (
          <div className="text-xs text-litera-mute">
            {t("import.sidebar.recentEmpty")}
          </div>
        ) : (
          <div className="space-y-3">
            {recent.data.map((paper) => (
              <RecentPaperCard
                key={paper.id}
                paper={paper}
                projects={projects.data ?? []}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function RecentPaperCard({
  paper,
  projects,
}: {
  paper: Paper;
  projects: ResearchProject[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState<ProjectSelection>("");
  const [message, setMessage] = useState<ActionMessage>(null);

  const quickRead = useMutation({
    mutationFn: () => api.paperQuickRead(paper.id),
    onSuccess: () => {
      setMessage({ kind: "ok", text: t("import.sidebar.quickReadDone") });
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
      qc.invalidateQueries({ queryKey: ["papers"], refetchType: "active" });
    },
    onError: (error) =>
      setActionError(error, setMessage, t("import.sidebar.actionFailed")),
  });
  const queue = useMutation({
    mutationFn: () => api.queueAdd(paper.id),
    onSuccess: () => {
      setMessage({ kind: "ok", text: t("import.sidebar.queueDone") });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (error) =>
      setActionError(error, setMessage, t("import.sidebar.actionFailed")),
  });
  const addProject = useMutation({
    mutationFn: () => {
      if (projectId === "")
        throw new Error(t("import.sidebar.projectRequired"));
      return api.projectAddPaper(projectId, paper.id);
    },
    onSuccess: () => {
      setMessage({ kind: "ok", text: t("import.sidebar.projectDone") });
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (projectId !== "") {
        qc.invalidateQueries({ queryKey: ["projects", projectId, "papers"] });
      }
    },
    onError: (error) =>
      setActionError(error, setMessage, t("import.sidebar.actionFailed")),
  });

  return (
    <article className="rounded-lg border border-litera-line/70 bg-litera-ink/15 p-3">
      <button
        type="button"
        onClick={() => navigate(`/reader/${paper.id}`)}
        className="block w-full text-left text-sm leading-snug text-litera-text hover:text-litera-accent"
      >
        {paper.title}
      </button>
      <div className="mt-1 text-[11px] text-litera-mute">
        {paper.authors.slice(0, 3).join(", ")}
        {paper.authors.length > 3 ? " et al." : ""}
        {paper.year ? ` · ${paper.year}` : ""}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate(`/reader/${paper.id}`)}
          className="litera-btn px-2 py-1 text-[11px]"
        >
          <BookOpen className="h-3 w-3" />
          {t("import.sidebar.openReader")}
        </button>
        <button
          type="button"
          onClick={() => quickRead.mutate()}
          disabled={quickRead.isPending}
          className="litera-btn px-2 py-1 text-[11px] disabled:opacity-50"
        >
          {quickRead.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {t("import.sidebar.quickRead")}
        </button>
        <button
          type="button"
          onClick={() => queue.mutate()}
          disabled={queue.isPending}
          className="litera-btn px-2 py-1 text-[11px] disabled:opacity-50"
        >
          {queue.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ListPlus className="h-3 w-3" />
          )}
          {t("queue.add")}
        </button>
      </div>
      {projects.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <select
            value={projectId}
            onChange={(event) =>
              setProjectId(event.target.value ? Number(event.target.value) : "")
            }
            className="litera-input min-w-0 flex-1 py-1 text-[11px]"
          >
            <option value="">{t("import.sidebar.projectSelect")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addProject.mutate()}
            disabled={addProject.isPending || projectId === ""}
            className="rounded-md p-1.5 text-litera-accent hover:bg-litera-line/70 disabled:opacity-50"
            title={t("import.sidebar.addProject")}
            aria-label={t("import.sidebar.addProject")}
          >
            {addProject.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
      {message && (
        <div
          className={
            "mt-2 text-[11px] " +
            (message.kind === "ok" ? "text-litera-accent" : "text-litera-error")
          }
        >
          {message.text}
        </div>
      )}
    </article>
  );
}

function setActionError(
  error: unknown,
  setMessage: (message: ActionMessage) => void,
  fallback: string
) {
  setMessage({ kind: "err", text: errorMessageOr(error, fallback) });
}
