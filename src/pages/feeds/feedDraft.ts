import { type ArxivDraft, type FeedItem } from "@/lib/api";
import { extractSourceIdentifier } from "@/lib/identifier";

export function feedItemToDraft(item: FeedItem): ArxivDraft {
  if (item.metadata) return item.metadata;
  const link = item.link ?? "";
  const { arxivId, doi } = extractSourceIdentifier(link);
  const year = item.published_at ? new Date(item.published_at * 1000).getUTCFullYear() : null;
  return {
    title: item.title,
    authors: item.authors,
    year,
    venue: null,
    doi,
    arxiv_id: arxivId,
    abstract_text: item.summary,
  };
}
