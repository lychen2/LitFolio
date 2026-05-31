import type { ArxivDraft } from "./library";

export interface Feed {
  id: number;
  url: string;
  title: string;
  description: string | null;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: number | null;
  last_error: string | null;
  created_at: number;
}

export interface FeedWithCounts extends Feed {
  total_items: number;
  unread_items: number;
}

export interface FeedItem {
  id: string;
  feed_id: number;
  entry_id: string;
  title: string;
  link: string | null;
  summary: string | null;
  authors: string[];
  published_at: number | null;
  fetched_at: number;
  seen: boolean;
  imported_paper_id: string | null;
  metadata: ArxivDraft | null;
  metadata_source: string | null;
  metadata_checked_at: number | null;
}

export interface FeedRefreshResult {
  new_items: number;
  not_modified: boolean;
}

export interface FeedRefreshAllSummary {
  refreshed: number;
  unchanged: number;
  failed: number;
  new_items: number;
  metadata_checked: number;
  errors: string[];
}
