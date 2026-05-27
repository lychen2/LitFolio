import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { api, type Paper } from "@/lib/api";

const RELATIONS = ["extends", "contradicts", "compares", "builds_on", "uses_method", "related"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  papers: Paper[];
  defaultSourceId?: string;
}

export function LinkCreateDialog({ open, onClose, onCreated, papers, defaultSourceId }: Props) {
  const t = useT();
  const [sourceId, setSourceId] = useState(defaultSourceId ?? "");
  const [targetId, setTargetId] = useState("");
  const [relation, setRelation] = useState<string>("related");
  const [snippet, setSnippet] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setSaving(true);
    try {
      await api.paperLinkCreate(sourceId, targetId, relation, snippet || null);
      onCreated();
      onClose();
      setTargetId("");
      setSnippet("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[420px] rounded-xl border border-litera-line bg-litera-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-litera-text">{t("graph.addLinkTitle")}</h2>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-litera-mute">{t("graph.sourcePaper")}</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full rounded-md border border-litera-line bg-litera-panel px-2.5 py-1.5 text-sm"
          >
            <option value="">{t("graph.selectPaper")}</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>

          <label className="block text-xs text-litera-mute">{t("graph.targetPaper")}</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md border border-litera-line bg-litera-panel px-2.5 py-1.5 text-sm"
          >
            <option value="">{t("graph.selectPaper")}</option>
            {papers.filter((p) => p.id !== sourceId).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>

          <label className="block text-xs text-litera-mute">{t("graph.relationType")}</label>
          <select
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            className="w-full rounded-md border border-litera-line bg-litera-panel px-2.5 py-1.5 text-sm"
          >
            {RELATIONS.map((r) => (
              <option key={r} value={r}>{t(`relation.${r}` as any)}</option>
            ))}
          </select>

          <label className="block text-xs text-litera-mute">{t("graph.snippet")}</label>
          <textarea
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-litera-line bg-litera-panel px-2.5 py-1.5 text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-litera-mute hover:text-litera-text">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!sourceId || !targetId || sourceId === targetId || saving}
            className="px-3 py-1.5 text-sm rounded-md bg-litera-accent text-white disabled:opacity-40"
          >
            {saving ? "…" : t("graph.addLink")}
          </button>
        </div>
      </div>
    </div>
  );
}
