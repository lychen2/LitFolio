import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Folder, FolderPlus, Loader2, Plus, Trash2 } from "lucide-react";
import type { FolderWithCount } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

type CreateMutation = ReturnType<typeof useMutation<unknown, Error, FolderCreateInput>>;

type FolderCreateInput = {
  name: string;
  parentId: number | null;
};

export function EmptyState({
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

export function FolderTree({
  folders, parentId, depth, selectedId, onSelect, onDelete, create,
}: {
  folders: FolderWithCount[];
  parentId: number | null;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onDelete: (id: number) => void;
  create: CreateMutation;
}) {
  const t = useT();
  const idSet = new Set(folders.map((f) => f.id));
  const children = childrenForParent(folders, idSet, parentId);
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
              className="p-1 text-litera-mute hover:text-litera-error opacity-0 group-hover:opacity-100"
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

export function CreateButton({
  parentId, create, variant,
}: {
  parentId: number | null;
  create: CreateMutation;
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
  return variant === "header" ? (
    <CreateRootButton pending={create.isPending} onOpen={() => setOpen(true)} />
  ) : (
    <CreateChildButton pending={create.isPending} onOpen={() => setOpen(true)} />
  );
}

export function FolderButton({
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

function CreateRootButton({ pending, onOpen }: { pending: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      disabled={pending}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-litera-text/80 hover:text-litera-accent hover:bg-litera-panel"
      title={t("folders.newRootTitle")}
    >
      {pending ? (
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

function CreateChildButton({ pending, onOpen }: { pending: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      disabled={pending}
      className="p-1 text-litera-mute hover:text-litera-text opacity-0 group-hover:opacity-100"
      title={t("folders.createChild")}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
    </button>
  );
}

function childrenForParent(
  folders: FolderWithCount[],
  idSet: Set<number>,
  parentId: number | null,
) {
  if (parentId == null) {
    return folders.filter((f) => f.parent_id == null || !idSet.has(f.parent_id as number));
  }
  return folders.filter((f) => f.parent_id != null && idSet.has(f.parent_id) && f.parent_id === parentId);
}
