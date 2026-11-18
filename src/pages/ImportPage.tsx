import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSearchParams } from "react-router-dom";
import { EasyReadFrame } from "@/features/reader/EasyReadFrame";
import { ImportSourceBanner } from "./import/ImportHeader";
import { extractIdentifier } from "@/lib/identifier";

/** Discovery remains a source; all imports use the upstream library workflow. */
export function ImportPage() {
  const [params] = useSearchParams();
  const link = params.get("link");
  const queryClient = useQueryClient();
  const fromFeedItem = params.get("fromFeedItem");
  const candidateId = params.has("candidateId") ? Number(params.get("candidateId")) : null;
  const imported = useCallback(async (paperId: string, reference: string) => {
    if (!link || reference.trim() !== link.trim()) return;
    if (fromFeedItem) {
      await api.feedItemLinkPaper(fromFeedItem, paperId);
      await queryClient.invalidateQueries({ queryKey: ["feed-items"] });
      await queryClient.invalidateQueries({ queryKey: ["feeds"] });
    }
    if (candidateId !== null) {
      await api.candidateSetStatus(candidateId, "imported");
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    }
  }, [link, fromFeedItem, candidateId, queryClient]);
  return (
    <section className="flex h-full flex-col">
      <ImportSourceBanner source={{
        link,
        title: params.get("title"),
        fromFeedItem,
        candidateId,
        prefill: link ? extractIdentifier(link) : null,
      }} />
      <div className="min-h-0 flex-1"><EasyReadFrame importReference={link ?? ""} onImported={imported} /></div>
    </section>
  );
}
