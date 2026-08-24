import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronDown, ChevronRight, Eye, Loader2, Play, Trash2 } from "lucide-react";
import { api, type TopicAlert } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function AlertCard({
  alert, expanded, onToggle, onRun, onDelete, running, freqLabel,
}: {
  alert: TopicAlert;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  running: boolean;
  freqLabel: (frequency: string) => string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: results = [] } = useQuery({
    queryKey: ["topic-alert-results", alert.id],
    queryFn: () => api.topicAlertResultsList(alert.id, false),
    enabled: expanded,
  });
  const markSeenMut = useMutation({
    mutationFn: (resultId: number) => api.topicAlertResultMarkSeen(resultId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alert-results", alert.id] }),
  });
  const markAllSeenMut = useMutation({
    mutationFn: () => api.topicAlertMarkAllSeen(alert.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alert-results", alert.id] }),
  });
  const unseenCount = results.filter((result) => !result.seen).length;
  const formatTime = (ts: number | null) => ts ? new Date(ts * 1000).toLocaleString() : t("alerts.never");

  return (
    <li className="border border-litera-line rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-litera-panel/50 transition-colors" onClick={onToggle}>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-litera-mute" /> : <ChevronRight className="h-3.5 w-3.5 text-litera-mute" />}
        <Bell className="h-3.5 w-3.5 text-litera-accent" />
        <span className="text-sm font-medium text-litera-text flex-1 truncate">{alert.query}</span>
        <span className="text-[10px] text-litera-mute">{freqLabel(alert.frequency)}</span>
        {unseenCount > 0 && <span className="text-[10px] bg-litera-accent/20 text-litera-accent px-1.5 py-0.5 rounded-full">{unseenCount}</span>}
        <button onClick={(e) => { e.stopPropagation(); onRun(); }} disabled={running} className="litera-btn text-[10px] px-1.5 py-0.5 disabled:opacity-50" title={t("alerts.run")}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-litera-mute hover:text-litera-error" title={t("alerts.delete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-litera-line px-3 py-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-litera-mute">
            <span>{t("alerts.lastRun")}: {formatTime(alert.last_run_at)}</span>
            {unseenCount > 0 && (
              <button onClick={() => markAllSeenMut.mutate()} className="flex items-center gap-1 text-litera-accent hover:underline">
                <CheckCheck className="h-3 w-3" /> {t("alerts.markAllSeen")}
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <p className="text-xs text-litera-mute py-2">{t("alerts.noResults")}</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-auto">
              {results.map((result) => (
                <li key={result.id} className={"flex items-start gap-2 px-2 py-1.5 rounded text-xs " + (result.seen ? "opacity-60" : "")}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-litera-text truncate">{result.title}</div>
                    <div className="text-litera-mute truncate">
                      {result.authors ?? "(unknown)"}
                      {result.year && ` · ${result.year}`}
                    </div>
                    {result.abstract_text && <div className="text-litera-mute/70 mt-0.5 line-clamp-2">{result.abstract_text}</div>}
                  </div>
                  {!result.seen && (
                    <button onClick={() => markSeenMut.mutate(result.id)} className="shrink-0 text-litera-mute hover:text-litera-accent" title={t("alerts.markSeen")}>
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
