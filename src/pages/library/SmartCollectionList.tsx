import { Layers, Plus, Trash2 } from "lucide-react";
import type { SmartCollection } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function SmartCollectionList({
  collections,
  selectedId,
  onCreate,
  onDelete,
  onSelect,
}: {
  collections: SmartCollection[];
  selectedId: number | null;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="px-3 py-2 border-t border-litera-line flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-litera-mute">{t("smartCollections.title")}</div>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-litera-text/80 hover:text-litera-accent hover:bg-litera-panel"
          title={t("smartCollections.create")}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="p-2">
        {collections.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-litera-mute">{t("smartCollections.noRules")}</p>
        ) : (
          collections.map((collection) => (
            <SmartCollectionRow
              key={collection.id}
              active={selectedId === collection.id}
              name={collection.name}
              onDelete={() => onDelete(collection.id)}
              onSelect={() => onSelect(collection.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function SmartCollectionRow({
  active,
  name,
  onDelete,
  onSelect,
}: {
  active: boolean;
  name: string;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <div className="group flex items-center gap-1">
      <button
        onClick={onSelect}
        className={
          "flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left " +
          (active ? "bg-litera-accent/15 text-litera-accent" : "text-litera-text/75 hover:bg-litera-panel")
        }
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={onDelete}
        className="p-1 text-litera-mute hover:text-litera-error opacity-0 group-hover:opacity-100"
        title={t("smartCollections.remove")}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
