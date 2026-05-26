import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { api, type FolderWithCount } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function FolderSidebar({
  selectedId, onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
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
      {create.error && <div className="px-3 py-2 text-xs text-red-400/90">{String(create.error)}</div>}
      {del.error && <div className="px-3 py-2 text-xs text-red-400/90">{String(del.error)}</div>}
    </aside>
  );
}

function EmptyState({
  onCreate, pending,
}: {
  onCreate: (name: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
  }
  return (
    <div className="mt-3 px-2 py-3 rounded border border-dashed border-litera-line/70 text-[11px] text-litera-mute leading-relaxed">
      <div className="mb-2 text-litera-text/80">{t("folders.emptyTitle")}</div>
      <div className="mb-2">{t("folders.emptyHint")}</div>
      <div className="flex gap-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("folders.namePlaceholder")}
          className="litera-input py-0.5 text-[11px] flex-1 min-w-0"
        />
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="litera-btn-primary text-[11px] px-2 py-0.5 disabled:opacity-50 shrink-0"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.create")}
        </button>
      </div>
    </div>
  );
}

function FolderTree({
  folders, parentId, depth, selectedId, onSelect, onDelete, create,
}: {
  folders: FolderWithCount[];
  parentId: number | null;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onDelete: (id: number) => void;
  create: ReturnType<typeof useMutation<unknown, Error, { name: string; parentId: number | null }>>;
}) {
  const t = useT();
  // Loose equality: handles parent_id arriving as undefined / number / null without
  // mismatching against parentId === null.
  // Orphan rescue: if a folder's parent_id refers to a folder that doesn't exist
  // (e.g. parent was deleted with FK SET NULL not firing, or stale data), surface
  // it at the root instead of hiding it.
  const idSet = new Set(folders.map((f) => f.id));
  const children =
    parentId == null
      ? folders.filter((f) => f.parent_id == null || !idSet.has(f.parent_id as number))
      : folders.filter((f) => f.parent_id != null && idSet.has(f.parent_id) && f.parent_id === parentId);
  return (
    <>
      {children.map((folder) => (
        <div key={folder.id}>
          <div className="group flex items-center gap-1">
            <FolderButton
              active={selectedId === folder.id}
              label={folder.name}
              count={folder.paper_count}
              depth={depth}
              onClick={() => onSelect(folder.id)}
            />
            <CreateButton parentId={folder.id} create={create} variant="row" />
            <button
              onClick={() => onDelete(folder.id)}
              className="p-1 text-litera-mute hover:text-red-400 opacity-0 group-hover:opacity-100"
              title={t("folders.deleteFolder")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <FolderTree
            folders={folders}
            parentId={folder.id}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            create={create}
          />
        </div>
      ))}
    </>
  );
}

function FolderButton({
  active, label, count, depth, onClick,
}: {
  active: boolean;
  label: string;
  count: number | null;
  depth: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left " +
        (active ? "bg-litera-accent/15 text-litera-accent" : "text-litera-text/75 hover:bg-litera-panel")
      }
      style={{ marginLeft: depth * 14 }}
    >
      <Folder className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto text-[10px] text-litera-mute">{count}</span>}
    </button>
  );
}

function CreateButton({
  parentId, create, variant,
}: {
  parentId: number | null;
  create: ReturnType<typeof useMutation<unknown, Error, { name: string; parentId: number | null }>>;
  variant: "header" | "row";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, parentId });
    setName("");
    setOpen(false);
  }
  if (open) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        className="litera-input py-0.5 text-[11px] w-28"
        placeholder={parentId == null ? t("folders.rootNamePlaceholder") : t("folders.childNamePlaceholder")}
      />
    );
  }
  if (variant === "header") {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={create.isPending}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-litera-text/80 hover:text-litera-accent hover:bg-litera-panel"
        title={t("folders.newRootTitle")}
      >
        {create.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <FolderPlus className="h-3 w-3" />
            {t("common.create")}
          </>
        )}
      </button>
    );
  }
  return (
    <button
      onClick={() => setOpen(true)}
      disabled={create.isPending}
      className="p-1 text-litera-mute hover:text-litera-text opacity-0 group-hover:opacity-100"
      title={t("folders.createChild")}
    >
      {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
    </button>
  );
}
