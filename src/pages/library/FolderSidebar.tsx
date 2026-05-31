import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api, type FilterRule } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { SmartCollectionEditor } from "@/components/SmartCollectionEditor";
import { EmptyState, FolderButton, FolderTree, CreateButton } from "./FolderSidebarTree";
import { SmartCollectionList } from "./SmartCollectionList";

export function FolderSidebar({
  selectedId, onSelect, selectedSmartId, onSelectSmart,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  selectedSmartId: number | null;
  onSelectSmart: (id: number | null) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const {
    data: folders = [],
    isLoading,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: ["folders"],
    queryFn: api.foldersList,
    retry: 1,
  });
  const create = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: number | null }) =>
      api.folderCreate(name, parentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.folderDelete(id),
    onSuccess: () => {
      onSelect(null);
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });

  const totalCount = folders.reduce((sum, f) => sum + f.paper_count, 0);

  // Smart collections
  const { data: smartCollections = [] } = useQuery({
    queryKey: ["smart-collections"],
    queryFn: api.smartCollectionsList,
  });
  const createSmart = useMutation({
    mutationFn: ({ name, rules }: { name: string; rules: FilterRule }) =>
      api.smartCollectionCreate(name, rules),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-collections"] }),
  });
  const deleteSmart = useMutation({
    mutationFn: (id: number) => api.smartCollectionDelete(id),
    onSuccess: () => {
      onSelectSmart(null);
      qc.invalidateQueries({ queryKey: ["smart-collections"] });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <aside className="w-[230px] shrink-0 border-r border-litera-line bg-litera-paper/40 overflow-auto flex flex-col">
      <div className="px-3 py-3 border-b border-litera-line flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-litera-mute">{t("folders.title")}</div>
        <CreateButton parentId={null} create={create} variant="header" />
      </div>
      <nav className="p-2 flex-1">
        <FolderButton
          active={selectedId == null}
          label={t("folders.all")}
          count={null}
          depth={0}
          onClick={() => onSelect(null)}
        />
        {listError ? (
          <div className="mt-3 px-2 py-3 rounded border border-red-400/50 bg-red-500/10 text-[11px] text-red-300 leading-relaxed">
            <div className="font-medium mb-1">{t("folders.loadFailed")}</div>
            <div className="break-words text-red-200/80">{String((listError as Error).message ?? listError)}</div>
            <button
              onClick={() => refetch()}
              className="mt-2 text-[11px] underline hover:text-red-100"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : isLoading ? (
          <div className="px-2 py-3 text-[11px] text-litera-mute flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
          </div>
        ) : folders.length === 0 ? (
          <EmptyState onCreate={(name) => create.mutate({ name, parentId: null })} pending={create.isPending} />
        ) : (
          <FolderTree
            folders={folders}
            parentId={null}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={(id) => del.mutate(id)}
            create={create}
          />
        )}
      </nav>
      {folders.length > 0 && (
        <div className="px-3 py-2 border-t border-litera-line text-[10px] text-litera-mute">
          {t("folders.summaryText", { count: folders.length, papers: totalCount })}
        </div>
      )}

      {/* Smart Collections */}
      <SmartCollectionList
        collections={smartCollections}
        selectedId={selectedSmartId}
        onCreate={() => setEditorOpen(true)}
        onDelete={(id) => deleteSmart.mutate(id)}
        onSelect={(id) => {
          onSelect(null);
          onSelectSmart(id);
        }}
      />

      {create.error && <div className="px-3 py-2 text-xs text-red-400/90">{String(create.error)}</div>}
      {del.error && <div className="px-3 py-2 text-xs text-red-400/90">{String(del.error)}</div>}
      {editorOpen && (
        <SmartCollectionEditor
          onSave={(name, rules) => {
            createSmart.mutate({ name, rules });
            setEditorOpen(false);
          }}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </aside>
  );
}
