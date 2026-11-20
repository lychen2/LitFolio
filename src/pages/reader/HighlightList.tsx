import type { CSSProperties } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Highlighter, Spinner } from "@/components/icons";
import type { Highlight } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { HighlightRow } from "./highlight-list/HighlightRow";

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
  list,
}: {
  paperId: string;
  onJump: (h: Highlight) => void;
  list: UseQueryResult<Highlight[]>;
}) {
  const t = useT();
  const queryClient = useQueryClient();

  return (
    <aside className="h-full flex flex-col bg-litera-paper/30 border-r border-litera-border">
      <div className="reader-panel-header">
        <span className="flex items-center gap-1.5 litera-section-label"><Highlighter className="h-3.5 w-3.5 text-litera-warn" /> {t("reader.highlights")}</span>
        <span className="ml-auto text-litera-mute normal-case tracking-normal">
          {list.data ? `${list.data.length}` : "…"}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {list.isLoading ? (
          <LoadingState />
        ) : list.isError ? (
          <div className="px-4 py-8 text-center text-xs text-litera-error">{t("common.loadFailed")}</div>
        ) : !list.data?.length ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-litera-line">
            {list.data.map((highlight) => (
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
      <Spinner className="h-3 w-3 animate-spin" /> {t("common.loading")}
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
