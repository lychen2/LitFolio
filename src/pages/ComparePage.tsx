import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookMarked, Loader2, Trash2 } from "lucide-react";
import { api, type PaperComparison, type ResearchProject } from "@/lib/api";
import { MarkdownView } from "@/components/MarkdownView";
import { useT } from "@/i18n/I18nProvider";

export function ComparePage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: comparisons, isLoading } = useQuery({
    queryKey: ["comparisons"],
    queryFn: api.paperComparisonsList,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
  });
  const requestedId = Number(params.get("id"));
  const requested = comparisons?.find((item) => item.id === requestedId) ?? null;
  const [manualSelected, setManualSelected] = useState<PaperComparison | null>(null);
  const selected = manualSelected ?? requested;

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.paperComparisonDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comparisons"] });
      setManualSelected(null);
    },
  });

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-2xl tracking-tight">Comparisons</h1>
        <p className="text-sm text-litera-mute">AI-generated multi-paper comparison tables</p>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar: list of comparisons */}
        <aside className="w-[260px] shrink-0 border-r border-litera-line overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-litera-mute" />
            </div>
          )}
          {comparisons?.map((c) => (
            <button
              key={c.id}
              onClick={() => setManualSelected(c)}
              className={
                "w-full text-left px-4 py-3 border-b border-litera-line text-sm transition-colors " +
                (selected?.id === c.id
                  ? "bg-litera-accent/10 text-litera-accent"
                  : "text-litera-text hover:bg-litera-panel")
              }
            >
              <div className="font-medium truncate">
                {c.paper_ids.length} papers
              </div>
              <div className="text-[11px] text-litera-mute">
                {new Date(c.updated_at * 1000).toLocaleDateString()}
                {" · "}{c.model}
              </div>
            </button>
          ))}
          {comparisons?.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-sm text-litera-mute">
              No comparisons yet. Select papers in the Library and click "Compare".
            </div>
          )}
        </aside>

        {/* Main: comparison content */}
        <main className="flex-1 overflow-auto p-6">
          {selected ? (
            <ComparisonDetail
              comparison={selected}
              projects={projects}
              onDelete={() => deleteMut.mutate(selected.id)}
              onUpdate={(content) => {
                api.paperComparisonUpdate(selected.id, content).then(() => {
                  qc.invalidateQueries({ queryKey: ["comparisons"] });
                  setManualSelected({ ...selected, content, updated_at: Date.now() / 1000 });
                });
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-litera-mute text-sm">
              Select a comparison from the sidebar
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function ComparisonDetail({
  comparison,
  projects,
  onDelete,
  onUpdate,
}: {
  comparison: PaperComparison;
  projects: ResearchProject[];
  onDelete: () => void;
  onUpdate: (content: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comparison.content);
  const [projectId, setProjectId] = useState<number | "">("");
  const addEvidence = useMutation({
    mutationFn: () => {
      if (projectId === "") throw new Error("Project is required");
      return api.evidenceAdd(projectId, {
        source_type: "comparison",
        paper_id: comparison.paper_ids[0] ?? null,
        highlight_id: null,
        page: null,
        label: "comparison",
        excerpt: comparison.content,
        note: `${comparison.paper_ids.length} papers compared`,
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">
            {comparison.paper_ids.length} papers compared
          </h2>
          <p className="text-xs text-litera-mute">
            Model: {comparison.model} · Created{" "}
            {new Date(comparison.created_at * 1000).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (editing) {
                onUpdate(draft);
                setEditing(false);
              } else {
                setDraft(comparison.content);
                setEditing(true);
              }
            }}
            className="litera-btn text-xs"
          >
            {editing ? "Save" : "Edit"}
          </button>
          <button onClick={onDelete} className="litera-btn text-xs text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-litera-mute">
          <span>{t("compare.evidenceProject")}</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : "")}
            className="litera-input py-1 text-xs"
          >
            <option value="">{t("common.none")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <button
            onClick={() => addEvidence.mutate()}
            disabled={addEvidence.isPending || projectId === ""}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {addEvidence.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />}
            {t("compare.addEvidence")}
          </button>
          {addEvidence.isSuccess && <span className="text-emerald-400">{t("compare.evidenceAdded")}</span>}
          {addEvidence.error && <span className="text-red-400/90">{(addEvidence.error as Error).message}</span>}
        </div>
      )}

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-[60vh] px-4 py-3 text-sm font-mono bg-litera-panel border border-litera-line rounded-md text-litera-text"
        />
      ) : (
        <>
          <ComparisonDifferenceTable rows={extractComparisonDifferenceRows(comparison.content)} />
          <MarkdownView
            content={comparison.content}
            className="prose prose-sm max-w-none dark:prose-invert"
          />
        </>
      )}
    </div>
  );
}

export interface ComparisonDifferenceRow {
  paper: string;
  problem: string;
  method: string;
  data: string;
  limitation: string;
}

export function extractComparisonDifferenceRows(markdown: string): ComparisonDifferenceRow[] {
  for (const table of markdownTables(markdown)) {
    const header = table[0].map(normalizeHeader);
    const columns = {
      paper: findColumn(header, ["paper", "title", "论文", "文献"]),
      problem: findColumn(header, ["problem", "question", "问题"]),
      method: findColumn(header, ["method", "approach", "方法"]),
      data: findColumn(header, ["data", "dataset", "setting", "数据", "场景"]),
      limitation: findColumn(header, ["limitation", "limits", "局限", "限制"]),
    };
    if (columns.problem < 0 || columns.method < 0 || columns.data < 0 || columns.limitation < 0) {
      continue;
    }
    return table.slice(2).map((row, index) => ({
      paper: cell(row, columns.paper >= 0 ? columns.paper : 0) || `P${index + 1}`,
      problem: cell(row, columns.problem),
      method: cell(row, columns.method),
      data: cell(row, columns.data),
      limitation: cell(row, columns.limitation),
    })).filter((row) => row.problem || row.method || row.data || row.limitation);
  }
  return [];
}

function ComparisonDifferenceTable({ rows }: { rows: ComparisonDifferenceRow[] }) {
  const t = useT();
  return (
    <section className="rounded-md border border-litera-line bg-litera-panel/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-litera-line text-sm font-medium text-litera-text">
        {t("compare.differenceTable")}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-litera-mute">
          {t("compare.noDifferenceTable")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-litera-mute border-b border-litera-line">
              <tr>
                <th className="text-left font-medium px-3 py-2 min-w-28">{t("compare.paper")}</th>
                <th className="text-left font-medium px-3 py-2 min-w-40">{t("compare.problem")}</th>
                <th className="text-left font-medium px-3 py-2 min-w-40">{t("compare.method")}</th>
                <th className="text-left font-medium px-3 py-2 min-w-40">{t("compare.data")}</th>
                <th className="text-left font-medium px-3 py-2 min-w-40">{t("compare.limitation")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-litera-line/60">
              {rows.map((row) => (
                <tr key={row.paper}>
                  <td className="px-3 py-2 align-top font-medium text-litera-text">{row.paper}</td>
                  <td className="px-3 py-2 align-top text-litera-text/80">{row.problem || "—"}</td>
                  <td className="px-3 py-2 align-top text-litera-text/80">{row.method || "—"}</td>
                  <td className="px-3 py-2 align-top text-litera-text/80">{row.data || "—"}</td>
                  <td className="px-3 py-2 align-top text-litera-text/80">{row.limitation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function markdownTables(markdown: string): string[][][] {
  const lines = markdown.split(/\r?\n/);
  const tables: string[][][] = [];
  let index = 0;
  while (index < lines.length) {
    if (!isTableRow(lines[index]) || !isSeparatorRow(lines[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    const rows: string[][] = [];
    while (index < lines.length && isTableRow(lines[index])) {
      rows.push(splitTableRow(lines[index]));
      index += 1;
    }
    if (rows.length >= 3) tables.push(rows);
  }
  return tables;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function findColumn(header: string[], needles: string[]): number {
  return header.findIndex((value) => needles.some((needle) => value.includes(needle)));
}

function cell(row: string[], index: number): string {
  return row[index]?.trim() ?? "";
}
