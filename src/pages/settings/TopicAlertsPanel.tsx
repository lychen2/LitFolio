import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { AlertCard } from "./AlertCard";

const FREQUENCIES: { value: string; labelKey: TKey }[] = [
  { value: "daily", labelKey: "alerts.freqDaily" },
  { value: "weekly", labelKey: "alerts.freqWeekly" },
  { value: "on_launch", labelKey: "alerts.freqOnLaunch" },
];

export function TopicAlertsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [newFreq, setNewFreq] = useState("weekly");
  const [newAutoImport, setNewAutoImport] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: alerts = [] } = useQuery({ queryKey: ["topic-alerts"], queryFn: api.topicAlertsList });
  const createMut = useMutation({
    mutationFn: () => api.topicAlertCreate(newQuery.trim(), newFreq, null, newAutoImport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic-alerts"] });
      setShowCreate(false);
      setNewQuery("");
      setNewFreq("weekly");
      setNewAutoImport(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.topicAlertDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });
  const runMut = useMutation({
    mutationFn: (alertId: number) => api.topicAlertRun(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });
  const runAllMut = useMutation({
    mutationFn: () => api.topicAlertRunAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });
  const freqLabel = (frequency: string) => {
    const entry = FREQUENCIES.find((item) => item.value === frequency);
    return entry ? t(entry.labelKey) : frequency;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-litera-text">{t("alerts.title")}</h3>
          <p className="text-xs text-litera-mute">{t("alerts.description")}</p>
        </div>
        <div className="flex gap-2">
          {alerts.length > 0 && (
            <button onClick={() => runAllMut.mutate()} disabled={runAllMut.isPending} className="litera-btn text-xs disabled:opacity-50">
              {runAllMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {t("alerts.runAll")}
            </button>
          )}
          <button onClick={() => setShowCreate(!showCreate)} className="litera-btn text-xs">
            <Plus className="h-3.5 w-3.5" /> {t("alerts.create")}
          </button>
        </div>
      </div>
      {showCreate && (
        <div className="border border-litera-line rounded-lg p-3 space-y-2">
          <input value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder={t("alerts.query")} className="litera-input text-xs w-full" />
          <div className="flex gap-2 items-center">
            <select value={newFreq} onChange={(e) => setNewFreq(e.target.value)} className="litera-input text-xs w-32">
              {FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{t(frequency.labelKey)}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-litera-mute">
              <input type="checkbox" checked={newAutoImport} onChange={(e) => setNewAutoImport(e.target.checked)} className="rounded" />
              {t("alerts.autoImport")}
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={!newQuery.trim() || createMut.isPending} className="litera-btn-primary text-xs disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.create")}
            </button>
            <button onClick={() => setShowCreate(false)} className="litera-btn text-xs">{t("common.cancel")}</button>
          </div>
          {createMut.error && <p className="text-xs text-litera-error">{(createMut.error as Error).message}</p>}
        </div>
      )}
      {alerts.length === 0 && !showCreate ? (
        <p className="text-xs text-litera-mute">{t("alerts.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              expanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
              onRun={() => runMut.mutate(alert.id)}
              onDelete={() => deleteMut.mutate(alert.id)}
              running={runMut.isPending}
              freqLabel={freqLabel}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
