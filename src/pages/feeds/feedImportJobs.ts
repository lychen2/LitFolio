import { type FeedItem } from "@/lib/api";
import {
  importJobId,
  subtitleFromDraft,
  titleFromDraft,
  upsertImportJob,
  type ImportJobStatus,
  type ImportJobStepStatus,
} from "../import/importJobs";
import { feedItemToDraft } from "./feedDraft";

type FeedImportJobUpdate = {
  status: ImportJobStatus;
  metadataStatus?: ImportJobStepStatus;
  pdfStatus?: ImportJobStepStatus;
  duplicateStatus?: ImportJobStepStatus;
  candidateId?: number;
  paperId?: string;
  error?: string;
};

export function upsertFeedImportJob(
  item: FeedItem,
  update: FeedImportJobUpdate,
) {
  const draft = feedItemToDraft(item);
  const metadataStatus = update.metadataStatus ?? feedMetadataStatus(item);

  upsertImportJob({
    id: importJobId("rss", item.id),
    source: "rss",
    title: titleFromDraft(draft, item.title),
    subtitle: subtitleFromDraft(draft) ?? item.link ?? undefined,
    status: update.status,
    metadataStatus,
    pdfStatus: update.pdfStatus ?? "pending",
    duplicateStatus: update.duplicateStatus ?? "checking",
    evidence: item.link ?? undefined,
    error: update.error,
    paperId: update.paperId,
    candidateId: update.candidateId,
    feedItemId: item.id,
  });
}

function feedMetadataStatus(item: FeedItem): ImportJobStepStatus {
  return item.metadata ? "ready" : "checking";
}
