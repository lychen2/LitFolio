import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, Loader2, X } from "lucide-react";
import { api, type Folder as FolderType } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { FolderAddPopover } from "./FolderAddPopover";

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
      <FolderAddPopover
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
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border border-litera-accent/40 bg-litera-accent/10 text-litera-text/90">
      <Folder className="h-2.5 w-2.5 text-litera-accent" />
      {folder.name}
      <button
        onClick={onRemove}
        disabled={pending}
        className="opacity-50 hover:opacity-100 ml-0.5"
        title={t("folders.removeFromFolder")}
      >
        {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
      </button>
    </span>
  );
}

function invalidate(qc: ReturnType<typeof useQueryClient>, paperId: string) {
  qc.invalidateQueries({ queryKey: ["paper-folders", paperId] });
  qc.invalidateQueries({ queryKey: ["folders"] });
  qc.invalidateQueries({ queryKey: ["papers"] });
}
