import { type CSSProperties, type MutableRefObject, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Highlighter, Loader2 } from "lucide-react";
import { api, type Highlight } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { HighlightRow } from "./highlight-list/HighlightRow";
import { isReaderMarginNote } from "./pdfSelectionHelpers";

export const MIN_SUMMARY_CHARS = 240;

export const WESTERN_TEXT_STYLE: CSSProperties = {
  hyphens: "auto",
  overflowWrap: "break-word",
  wordBreak: "normal",
  textWrap: "pretty",
};

export function HighlightList({
  paperId,
  onJump,
  highlightsRef,
}: {
  paperId: string;
  onJump: (h: Highlight) => void;
  highlightsRef?: MutableRefObject<Array<{ id: string }>>;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["highlights", paperId],
    queryFn: () => api.highlightList(paperId),
  });
  const visibleHighlights = useMemo(
    () => (list.data ?? []).filter((highlight) => !isReaderMarginNote(highlight)),
    [list.data],
  );

  useEffect(() => {
    if (highlightsRef && list.data) {
      highlightsRef.current = visibleHighlights;
    }
  }, [highlightsRef, visibleHighlights]);

  return (
    <aside className="h-full flex flex-col bg-litera-paper/30 border-r border-litera-line">
      <div className="px-3 py-2 border-b border-litera-line flex items-center gap-1.5 text-xs uppercase tracking-wider text-litera-mute">
        <Highlighter className="h-3.5 w-3.5 text-amber-400" /> {t("reader.highlights")}
        <span className="ml-auto text-litera-mute normal-case tracking-normal">
          {list.data ? `${visibleHighlights.length}` : "…"}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {list.isLoading ? (
          <LoadingState />
        ) : visibleHighlights.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-litera-line">
            {visibleHighlights.map((highlight) => (
              <HighlightRow
                key={highlight.id}
                highlight={highlight}
                onJump={() => onJump(highlight)}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ["highlights", paperId] })}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function LoadingState() {
  const t = useT();
  return (
    <div className="text-xs text-litera-mute text-center mt-8 flex items-center justify-center gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="px-4 py-8 text-center text-xs text-litera-mute">
      {t("reader.highlightEmpty", { action: t("reader.addHighlight") })}
    </div>
  );
}
