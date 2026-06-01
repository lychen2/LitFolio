import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ClipboardCopy, FolderKanban, GitCompareArrows, Loader2, MessagesSquare, Plus, Search, Trash2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, type EvidenceItem, type Paper, type ProjectDraft, type ProjectStatus, type ResearchProject } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { ProjectWeeklyReviewPanel } from "@/pages/projects/ProjectWeeklyReviewPanel";
import { ProjectWritingPanel } from "@/pages/projects/ProjectWritingPanel";

const STATUS_OPTIONS: ProjectStatus[] = ["active", "paused", "archived"];

const EMPTY_DRAFT: ProjectDraft = {
  name: "",
  description: null,
  research_question: null,
  target_output: null,
  status: "active",
  due_date: null,
};

export function ProjectsPage() {
  const t = useT();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
  });
  const selected = useMemo(
    () => projects.data?.find((project) => project.id === selectedId) ?? projects.data?.[0] ?? null,
    [projects.data, selectedId],
  );

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-litera-accent" />
            {t("projects.title")}
          </h1>
          <p className="text-sm text-litera-mute">{t("projects.subtitle")}</p>
        </div>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)]">
        <ProjectSidebar
          projects={projects.data ?? []}
          loading={projects.isLoading}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <ProjectWorkspace project={selected} />
      </div>
    </section>
  );
}

function ProjectSidebar({
  projects,
  loading,
  selectedId,
  onSelect,
}: {
  projects: ResearchProject[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.projectCreate({
      ...EMPTY_DRAFT,
      name: t("projects.create"),
    }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onSelect(project.id);
    },
  });

  return (
    <aside className="border-r border-litera-line bg-litera-paper/30 min-h-0 flex flex-col">
      <div className="p-3 border-b border-litera-line">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="litera-btn-primary w-full justify-center disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("projects.create")}
        </button>
        {create.error && <div className="mt-2 text-xs text-red-400/90">{(create.error as Error).message}</div>}
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-litera-mute flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : projects.length === 0 ? (
          <div className="p-5 text-sm text-litera-mute leading-relaxed">{t("projects.empty")}</div>
        ) : (
          <ul className="divide-y divide-litera-line">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  onClick={() => onSelect(project.id)}
                  className={
                    "w-full px-4 py-3 text-left transition-colors " +
                    (project.id === selectedId ? "bg-litera-panel text-litera-text" : "hover:bg-litera-panel/50")
                  }
                >
                  <div className="font-medium leading-snug">{project.name}</div>
                  <div className="mt-1 text-[11px] text-litera-mute flex items-center gap-2">
                    <span>{t(`projects.status.${project.status}` as TKey)}</span>
                    <span>{t("projects.paperCount", { count: project.paper_count })}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ProjectWorkspace({ project }: { project: ResearchProject | null }) {
  const t = useT();
  if (!project) {
    return (
      <div className="h-full grid place-items-center text-center text-litera-mute">
        <div>
          <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t("projects.empty")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-0 overflow-auto">
      <ProjectEditor project={project} />
      <ProjectPapers project={project} />
      <ProjectWeeklyReviewPanel project={project} />
      <ProjectWritingPanel project={project} />
      <ProjectEvidence project={project} />
    </div>
  );
}

function ProjectEditor({ project }: { project: ResearchProject }) {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ProjectDraft>(() => projectToDraft(project));
  const [packageCopied, setPackageCopied] = useState(false);
  const save = useMutation({
    mutationFn: () => api.projectUpdate(project.id, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const remove = useMutation({
    mutationFn: () => api.projectDelete(project.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const exportPackage = useMutation({
    mutationFn: () => api.projectExportMarkdown(project.id),
    onSuccess: async (markdown) => {
      await navigator.clipboard.writeText(markdown);
      setPackageCopied(true);
    },
  });

  return (
    <section className="border-b border-litera-line px-6 py-5 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3">
        <label>
          <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("projects.name")}</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={t("projects.namePlaceholder")}
            className="litera-input mt-1 w-full"
          />
        </label>
        <label>
          <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("projects.status")}</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}
            className="litera-input mt-1 w-full"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{t(`projects.status.${status}` as TKey)}</option>
            ))}
          </select>
        </label>
      </div>
      <FieldArea
        label={t("projects.question")}
        value={draft.research_question ?? ""}
        onChange={(value) => setDraft({ ...draft, research_question: nullable(value) })}
      />
      <div className="grid grid-cols-2 gap-3">
        <FieldArea
          label={t("projects.description")}
          value={draft.description ?? ""}
          onChange={(value) => setDraft({ ...draft, description: nullable(value) })}
        />
        <FieldArea
          label={t("projects.targetOutput")}
          value={draft.target_output ?? ""}
          onChange={(value) => setDraft({ ...draft, target_output: nullable(value) })}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-litera-mute">
          {save.isSuccess ? t("projects.saved") : t("projects.overview")}
          {packageCopied && <span className="ml-2 text-emerald-400">{t("projects.packageCopied")}</span>}
          {save.error && <span className="ml-2 text-red-400/90">{(save.error as Error).message}</span>}
          {remove.error && <span className="ml-2 text-red-400/90">{(remove.error as Error).message}</span>}
          {exportPackage.error && <span className="ml-2 text-red-400/90">{(exportPackage.error as Error).message}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportPackage.mutate()}
            disabled={exportPackage.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {exportPackage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {t("projects.packageExport")}
          </button>
          <button
            onClick={() => {
              if (window.confirm(t("projects.deleteConfirm"))) remove.mutate();
            }}
            disabled={remove.isPending}
            className="litera-btn text-xs disabled:opacity-50"
            title={t("projects.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("projects.delete")}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !draft.name.trim()}
            className="litera-btn-primary text-xs disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("common.save")}
          </button>
        </div>
      </div>
    </section>
  );
}

function FieldArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-[11px] uppercase tracking-wider text-litera-mute">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="litera-input mt-1 w-full min-h-20 resize-y"
      />
    </label>
  );
}

function ProjectPapers({ project }: { project: ResearchProject }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const papers = useQuery({
    queryKey: ["projects", project.id, "papers"],
    queryFn: () => api.projectPapersList(project.id),
  });
  const search = useQuery({
    queryKey: ["projects", project.id, "paper-search", query],
    queryFn: () => query.trim() ? api.papersSearch(query.trim(), 8) : api.papersRecent(8),
  });
  const add = useMutation({
    mutationFn: (paperId: string) => api.projectAddPaper(project.id, paperId),
    onSuccess: () => invalidateProject(qc, project.id),
  });
  const remove = useMutation({
    mutationFn: (paperId: string) => api.projectRemovePaper(project.id, paperId),
    onSuccess: () => invalidateProject(qc, project.id),
  });
  const compare = useMutation({
    mutationFn: (paperIds: string[]) => api.paperComparisonGenerate(paperIds),
    onSuccess: (report) => navigate(`/compare?id=${report.id}`),
  });
  const linked = new Set((papers.data ?? []).map((paper) => paper.id));
  const linkedPapers = papers.data ?? [];

  return (
    <section className="px-6 py-5 grid grid-cols-[minmax(0,1fr)_340px] gap-5">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg">{t("projects.papers")}</h2>
          <div className="flex items-center gap-2">
            <Link to={`/ask?projectId=${project.id}`} className="litera-btn text-xs">
              <MessagesSquare className="h-3.5 w-3.5" />
              {t("projects.askProject")}
            </Link>
            <button
              onClick={() => compare.mutate(linkedPapers.map((paper) => paper.id))}
              disabled={compare.isPending || linkedPapers.length < 2}
              className="litera-btn text-xs disabled:opacity-50"
              title={linkedPapers.length < 2 ? t("projects.compareNeedPapers") : t("projects.compareProject")}
            >
              {compare.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
              {t("projects.compareProject")}
            </button>
          </div>
        </div>
        {compare.error && <div className="mb-2 text-xs text-red-400/90">{(compare.error as Error).message}</div>}
        {papers.data && papers.data.length > 0 ? (
          <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
            {papers.data.map((paper) => (
              <PaperRow
                key={paper.id}
                paper={paper}
                actionLabel={t("projects.removePaper")}
                onAction={() => remove.mutate(paper.id)}
                removing={remove.isPending}
              />
            ))}
          </ul>
        ) : (
          <div className="text-sm text-litera-mute border border-litera-line rounded-md p-4">{t("projects.noPapers")}</div>
        )}
      </div>
      <aside>
        <label>
          <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("projects.searchPapers")}</span>
          <div className="mt-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-litera-mute" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="litera-input flex-1"
            />
          </div>
        </label>
        <ul className="mt-3 divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {(search.data ?? []).map((paper) => (
            <PaperRow
              key={paper.id}
              paper={paper}
              actionLabel={linked.has(paper.id) ? t("common.current") : t("projects.addPaper")}
              onAction={() => add.mutate(paper.id)}
              removing={add.isPending || linked.has(paper.id)}
            />
          ))}
        </ul>
        {(add.error || remove.error) && (
          <div className="mt-2 text-xs text-red-400/90">{((add.error ?? remove.error) as Error).message}</div>
        )}
      </aside>
    </section>
  );
}

function ProjectEvidence({ project }: { project: ResearchProject }) {
  const t = useT();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const evidence = useQuery({
    queryKey: ["projects", project.id, "evidence"],
    queryFn: () => api.evidenceList(project.id),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.evidenceDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", project.id, "evidence"] }),
  });
  const exportMarkdown = useMutation({
    mutationFn: () => api.evidenceExportMarkdown(project.id),
    onSuccess: async (markdown) => {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    },
  });

  return (
    <section className="border-t border-litera-line px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg">{t("projects.evidence")}</h2>
        <button
          onClick={() => exportMarkdown.mutate()}
          disabled={exportMarkdown.isPending || (evidence.data?.length ?? 0) === 0}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {exportMarkdown.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {t("projects.evidenceExport")}
        </button>
      </div>
      {copied && <div className="mb-2 text-xs text-emerald-400">{t("projects.evidenceCopied")}</div>}
      {exportMarkdown.error && <div className="mb-2 text-xs text-red-400/90">{(exportMarkdown.error as Error).message}</div>}
      {evidence.data && evidence.data.length > 0 ? (
        <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {evidence.data.map((item) => (
            <EvidenceRow
              key={item.id}
              item={item}
              removing={remove.isPending}
              onRemove={() => remove.mutate(item.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="text-sm text-litera-mute border border-litera-line rounded-md p-4">{t("projects.noEvidence")}</div>
      )}
      {remove.error && <div className="mt-2 text-xs text-red-400/90">{(remove.error as Error).message}</div>}
    </section>
  );
}

function EvidenceRow({
  item,
  removing,
  onRemove,
}: {
  item: EvidenceItem;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="px-4 py-3 hover:bg-litera-panel/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-litera-mute flex flex-wrap items-center gap-2">
            <span>{item.paper_title ?? item.source_type}</span>
            {item.page != null && <span>p. {item.page}</span>}
            {item.label && <span className="rounded border border-litera-line px-1.5 py-0.5 uppercase tracking-wider">{item.label}</span>}
          </div>
          <blockquote className="mt-2 text-sm text-litera-text/85 leading-relaxed">
            {item.excerpt}
          </blockquote>
          {item.note && <p className="mt-2 text-xs text-litera-mute">{item.note}</p>}
        </div>
        <button
          onClick={onRemove}
          disabled={removing}
          className="text-litera-mute hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function PaperRow({
  paper,
  actionLabel,
  removing,
  onAction,
}: {
  paper: Paper;
  actionLabel: string;
  removing: boolean;
  onAction: () => void;
}) {
  return (
    <li className="px-3 py-2.5 hover:bg-litera-panel/40 transition-colors">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 text-litera-mute shrink-0" />
        <div className="min-w-0 flex-1">
          <Link to={`/reader/${paper.id}`} className="text-sm text-litera-text hover:text-litera-accent leading-snug">
            {paper.title}
          </Link>
          <div className="text-[11px] text-litera-mute mt-1 truncate">
            {paper.authors.slice(0, 3).join(", ")}
            {paper.year ? ` · ${paper.year}` : ""}
          </div>
        </div>
        <button
          onClick={onAction}
          disabled={removing}
          className="text-[11px] text-litera-mute hover:text-litera-text disabled:opacity-50 inline-flex items-center gap-1"
        >
          {actionLabel === "Remove" || actionLabel === "移除" ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {actionLabel}
        </button>
      </div>
    </li>
  );
}

function projectToDraft(project: ResearchProject): ProjectDraft {
  return {
    name: project.name,
    description: project.description,
    research_question: project.research_question,
    target_output: project.target_output,
    status: project.status,
    due_date: project.due_date,
  };
}

function invalidateProject(qc: ReturnType<typeof useQueryClient>, id: number) {
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["projects", id, "papers"] });
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
