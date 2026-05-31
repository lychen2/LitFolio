import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Folder, FolderPlus, Loader2 } from "lucide-react";
import { type FolderWithCount } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

/// Floating folder picker for a single paper, rendered through a portal.
///
/// The trigger lives inside the virtualized paper list, whose scroll container
/// is `overflow-auto` (clips absolutely-positioned children) and whose rows are
/// each `position:absolute` + `transform` (own stacking context). A normal
/// `absolute z-20` dropdown is therefore clipped and painted over by the next
/// row. Portalling the panel to <body> with fixed coordinates escapes both.
export function FolderAddPopover({
  folders, linkedIds, onToggle, onCreate, busy, empty,
}: {
  folders: FolderWithCount[];
  linkedIds: Set<number>;
  onToggle: (folderId: number) => void;
  onCreate: (name: string) => void;
  busy: boolean;
  empty: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the portalled panel against the trigger before paint to avoid a flash.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // The panel is portalled to <body>, so it lives outside triggerRef. Close
    // only when the click is in neither the trigger nor the panel.
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Fixed coords go stale once the virtual list scrolls; closing is simpler and
    // safer than re-tracking a detached panel for this ephemeral picker.
    function dismiss() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  return (
    <div className="relative" ref={triggerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy && !open}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border border-dashed border-litera-line text-litera-mute hover:text-litera-text hover:border-litera-text"
        title={t("folders.addTitle")}
      >
        {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FolderPlus className="h-2.5 w-2.5" />}
        {empty ? t("folders.createCategoryBtn") : t("folders.addCategoryBtn")}
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: coords.top, left: coords.left }}
          className="z-50 w-56 max-h-72 overflow-auto bg-litera-paper border border-litera-line rounded shadow-xl py-1"
        >
          {folders.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-litera-mute">{t("folders.noCategoriesYet")}</div>
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
              placeholder={t("folders.rootNamePlaceholder")}
              className="litera-input py-0.5 text-[11px] flex-1 min-w-0"
            />
            <button
              onClick={submitCreate}
              disabled={!newName.trim()}
              className="text-[11px] px-1.5 rounded bg-litera-accent/20 text-litera-accent disabled:opacity-40"
              title={t("folders.createAndAttachTitle")}
            >
              {t("folders.createInline")}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function folderPath(folder: FolderWithCount, folders: FolderWithCount[]): string {
  if (folder.parent_id == null) return folder.name;
  const parent = folders.find((f) => f.id === folder.parent_id);
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}
