import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { api, type PaperComparison } from "@/lib/api";
import { MarkdownView } from "@/components/MarkdownView";

export function ComparePage() {
  const qc = useQueryClient();
  const { data: comparisons, isLoading } = useQuery({
    queryKey: ["comparisons"],
    queryFn: api.paperComparisonsList,
  });
  const [selected, setSelected] = useState<PaperComparison | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.paperComparisonDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comparisons"] });
      setSelected(null);
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
              onClick={() => setSelected(c)}
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
              onDelete={() => deleteMut.mutate(selected.id)}
              onUpdate={(content) => {
                api.paperComparisonUpdate(selected.id, content).then(() => {
                  qc.invalidateQueries({ queryKey: ["comparisons"] });
                  setSelected({ ...selected, content, updated_at: Date.now() / 1000 });
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
  onDelete,
  onUpdate,
}: {
  comparison: PaperComparison;
  onDelete: () => void;
  onUpdate: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comparison.content);

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

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-[60vh] px-4 py-3 text-sm font-mono bg-litera-panel border border-litera-line rounded-md text-litera-text"
        />
      ) : (
        <MarkdownView
          content={comparison.content}
          className="prose prose-sm max-w-none dark:prose-invert"
        />
      )}
    </div>
  );
}
