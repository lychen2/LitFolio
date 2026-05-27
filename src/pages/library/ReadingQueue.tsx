import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, GripVertical, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ReadingQueue() {
  const t = useT();
  const qc = useQueryClient();
  const { data: entries, isLoading } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.queueList(),
    refetchOnWindowFocus: false,
  });

  const removeMut = useMutation({
    mutationFn: (paperId: string) => api.queueRemove(paperId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-litera-mute" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-litera-mute">
        <div className="text-center">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t("queue.empty")}</p>
        </div>
      </div>
    );
  }

  const now = Date.now() / 1000;

  return (
    <div className="h-full overflow-auto">
      <ul className="divide-y divide-litera-line">
        {entries.map((entry, idx) => {
          const isOverdue = entry.target_date != null && entry.target_date < now;
          return (
            <li
              key={entry.paper_id}
              className="px-4 py-3 hover:bg-litera-panel/50 transition-colors flex items-start gap-3"
            >
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <GripVertical className="h-4 w-4 text-litera-mute cursor-grab" />
                <span className="text-[10px] text-litera-mute font-mono">{idx + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-litera-text truncate">
                  {entry.title ?? entry.paper_id}
                </div>
                <div className="text-xs text-litera-mute mt-0.5">
                  {entry.authors && <span>{entry.authors}</span>}
                  {entry.year && <span> · {entry.year}</span>}
                </div>
                {entry.note && (
                  <p className="text-xs text-litera-text/70 mt-1 line-clamp-2">{entry.note}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  {entry.target_date != null && (
                    <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? "text-red-400" : "text-litera-mute"}`}>
                      <Calendar className="h-3 w-3" />
                      {new Date(entry.target_date * 1000).toLocaleDateString()}
                      {isOverdue && ` (${t("queue.overdue")})`}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeMut.mutate(entry.paper_id)}
                disabled={removeMut.isPending}
                className="text-litera-mute hover:text-red-400 transition-colors shrink-0 mt-1"
                title={t("queue.remove")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
