import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";

const FIELD_TYPES: { value: string; labelKey: TKey }[] = [
  { value: "text", labelKey: "customFields.typeText" },
  { value: "number", labelKey: "customFields.typeNumber" },
  { value: "date", labelKey: "customFields.typeDate" },
  { value: "select", labelKey: "customFields.typeSelect" },
];

export function CustomFieldsManager() {
  const t = useT();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState("");
  const { data: defs = [] } = useQuery({ queryKey: ["custom-field-defs"], queryFn: api.customFieldDefsList });
  const createMut = useMutation({
    mutationFn: () => {
      const opts = newType === "select" && newOptions.trim()
        ? newOptions.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      return api.customFieldDefCreate(newName.trim(), newType, opts);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-field-defs"] });
      setShowCreate(false);
      setNewName("");
      setNewType("text");
      setNewOptions("");
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.customFieldDefDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-field-defs"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-litera-text">{t("customFields.title")}</h3>
          <p className="text-xs text-litera-mute">{t("customFields.description")}</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="litera-btn text-xs">
          <Plus className="h-3.5 w-3.5" /> {t("customFields.create")}
        </button>
      </div>
      {showCreate && (
        <div className="border border-litera-line rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("customFields.name")} className="litera-input text-xs flex-1" />
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="litera-input text-xs w-32">
              {FIELD_TYPES.map((fieldType) => <option key={fieldType.value} value={fieldType.value}>{t(fieldType.labelKey)}</option>)}
            </select>
          </div>
          {newType === "select" && (
            <input value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder={t("customFields.options")} className="litera-input text-xs w-full" />
          )}
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending} className="litera-btn-primary text-xs disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.create")}
            </button>
            <button onClick={() => setShowCreate(false)} className="litera-btn text-xs">{t("smartCollections.cancel")}</button>
          </div>
          {createMut.error && <p className="text-xs text-red-400">{(createMut.error as Error).message}</p>}
        </div>
      )}
      {defs.length === 0 && !showCreate ? (
        <p className="text-xs text-litera-mute">{t("customFields.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {defs.map((def) => (
            <li key={def.id} className="flex items-center gap-2 px-3 py-2 rounded border border-litera-line text-xs">
              <span className="font-medium text-litera-text">{def.name}</span>
              <span className="text-litera-mute">({def.field_type})</span>
              {def.options && <span className="text-litera-mute">[{def.options.join(", ")}]</span>}
              <div className="flex-1" />
              <button onClick={() => deleteMut.mutate(def.id)} className="text-litera-mute hover:text-red-400" title={t("customFields.delete")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
