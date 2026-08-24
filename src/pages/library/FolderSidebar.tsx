import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { api, type FilterRule } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { SmartCollectionEditor } from "@/components/SmartCollectionEditor";
import { EmptyState, FolderButton, FolderTree, CreateButton } from "./FolderSidebarTree";
import { SmartCollectionList } from "./SmartCollectionList";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";

export function FolderSidebar({
  selectedId, onSelect, selectedSmartId, onSelectSmart, compactOpen, onClose,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  selectedSmartId: number | null;
  onSelectSmart: (id: number | null) => void;
  compactOpen: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const isCompact = useNarrowLayout(901);
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

  if (isCompact && !compactOpen) return null;

  return (
    <aside
      className={`w-[240px] shrink-0 overflow-auto border-r border-litera-border bg-litera-paper/35 transition-transform duration-200 max-[1024px]:w-[205px] max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[260px] max-[900px]:bg-litera-paper max-[900px]:shadow-2xl ${compactOpen ? "max-[900px]:translate-x-0" : "max-[900px]:-translate-x-full"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-litera-border px-3 py-3">
        <div className="litera-section-label">{t("folders.title")}</div>
        <div className="flex items-center gap-1">
          <CreateButton parentId={null} create={create} variant="header" />
          <button type="button" onClick={onClose} className="litera-icon-btn hidden h-7 w-7 max-[900px]:inline-flex" aria-label={t("common.close")} title={t("common.close")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
          <div className="mt-3 px-2 py-3 rounded border border-litera-error/50 bg-litera-error/10 text-[11px] text-litera-error leading-relaxed">
            <div className="font-medium mb-1">{t("folders.loadFailed")}</div>
            <div className="break-words text-litera-error">{String((listError as Error).message ?? listError)}</div>
            <button
              onClick={() => refetch()}
              className="mt-2 text-[11px] underline hover:text-litera-error"
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

      {create.error && <div className="px-3 py-2 text-xs text-litera-error">{String(create.error)}</div>}
      {del.error && <div className="px-3 py-2 text-xs text-litera-error">{String(del.error)}</div>}
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
