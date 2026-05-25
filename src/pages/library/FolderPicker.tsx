import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Folder, FolderPlus, Loader2, X } from "lucide-react";
import { api, type Folder as FolderType, type FolderWithCount } from "@/lib/api";

/// Folder picker for a single paper.
///
/// Multi-folder is explicitly supported by the schema (paper_folders is a
/// many-to-many table with composite PK + INSERT OR IGNORE on attach), but the
/// old <select> UI made it feel like a swap. This version uses an explicit
/// popover with checkmarks so it's obvious you can attach the same paper to
/// several folders at once.
export function FolderPicker({ paperId }: { paperId: string }) {
  const qc = useQueryClient();
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: api.foldersList,
  });
  const { data: linked = [] } = useQuery({
    queryKey: ["paper-folders", paperId],
    queryFn: () => api.paperFolders(paperId),
  });
  const attach = useMutation({
    mutationFn: (folderId: number) => api.paperAttachFolder(paperId, folderId),
    onSuccess: () => invalidate(qc, paperId),
  });
  const detach = useMutation({
    mutationFn: (folderId: number) => api.paperDetachFolder(paperId, folderId),
    onSuccess: () => invalidate(qc, paperId),
  });
  const create = useMutation({
    mutationFn: (name: string) => api.folderCreate(name, null),
    onSuccess: (folder) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      // Auto-attach the freshly created folder so the user doesn't have to click again.
      attach.mutate(folder.id);
    },
  });

  const linkedIds = new Set(linked.map((f) => f.id));
  const busy = attach.isPending || detach.isPending;

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      {linked.map((folder) => (
        <FolderChip
          key={folder.id}
          folder={folder}
          pending={detach.isPending && detach.variables === folder.id}
          onRemove={() => detach.mutate(folder.id)}
        />
      ))}
      <AddPopover
        folders={folders}
        linkedIds={linkedIds}
        onToggle={(id) => (linkedIds.has(id) ? detach.mutate(id) : attach.mutate(id))}
        onCreate={(name) => create.mutate(name)}
        busy={busy || create.isPending}
        empty={folders.length === 0}
      />
    </div>
  );
}

function FolderChip({
  folder, pending, onRemove,
}: {
  folder: FolderType;
  pending: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border border-litera-accent/40 bg-litera-accent/10 text-litera-text/90">
      <Folder className="h-2.5 w-2.5 text-litera-accent" />
      {folder.name}
      <button
        onClick={onRemove}
        disabled={pending}
        className="opacity-50 hover:opacity-100 ml-0.5"
        title="从此文件夹中移除"
      >
        {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
      </button>
    </span>
  );
}

function AddPopover({
  folders, linkedIds, onToggle, onCreate, busy, empty,
}: {
  folders: FolderWithCount[];
  linkedIds: Set<number>;
  onToggle: (folderId: number) => void;
  onCreate: (name: string) => void;
  busy: boolean;
  empty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function submitCreate() {
    const t = newName.trim();
    if (!t) return;
    onCreate(t);
    setNewName("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy && !open}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border border-dashed border-litera-line text-litera-mute hover:text-litera-text hover:border-litera-text"
        title="添加到文件夹(可多选)"
      >
        {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FolderPlus className="h-2.5 w-2.5" />}
        {empty ? "新建分类" : "添加分类"}
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-56 max-h-72 overflow-auto bg-litera-paper border border-litera-line rounded shadow-xl py-1">
          {folders.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-litera-mute">尚未创建分类</div>
          ) : (
            folders.map((folder) => {
              const checked = linkedIds.has(folder.id);
              return (
                <button
                  key={folder.id}
                  onClick={() => onToggle(folder.id)}
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1 text-[11px] hover:bg-litera-panel"
                >
                  <span className="w-3 h-3 rounded-sm border border-litera-line flex items-center justify-center shrink-0">
                    {checked && <Check className="h-2.5 w-2.5 text-litera-accent" />}
                  </span>
                  <Folder className="h-2.5 w-2.5 text-litera-mute" />
                  <span className="truncate">{folderPath(folder, folders)}</span>
                  <span className="ml-auto text-[10px] text-litera-mute">{folder.paper_count}</span>
                </button>
              );
            })
          )}
          <div className="px-2 py-1.5 border-t border-litera-line/60 mt-1 flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="新分类名"
              className="litera-input py-0.5 text-[11px] flex-1 min-w-0"
            />
            <button
              onClick={submitCreate}
              disabled={!newName.trim()}
              className="text-[11px] px-1.5 rounded bg-litera-accent/20 text-litera-accent disabled:opacity-40"
              title="新建并自动归类此文献"
            >
              + 建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function folderPath(folder: FolderWithCount, folders: FolderWithCount[]): string {
  if (folder.parent_id == null) return folder.name;
  const parent = folders.find((f) => f.id === folder.parent_id);
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}

function invalidate(qc: ReturnType<typeof useQueryClient>, paperId: string) {
  qc.invalidateQueries({ queryKey: ["paper-folders", paperId] });
  qc.invalidateQueries({ queryKey: ["folders"] });
  qc.invalidateQueries({ queryKey: ["papers"] });
}
