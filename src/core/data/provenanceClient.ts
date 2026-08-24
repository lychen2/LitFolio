import { invokeParsed } from "@/lib/apiInvoke";
import { parseArray } from "@/lib/apiSchemaCore";
import {
  parseBackfillReport,
  parseBacklinkRow,
  parseDocumentCandidate,
  parseDocumentRevision,
  parseNoteRevision,
  parseNoteSaveResult,
  parseProvenanceExport,
  parseRemapReport,
  parseSourceLink,
  parseSourceLinkResolution,
  parseSegment,
  type BackfillReport,
  type BacklinkRow,
  type DocumentCandidate,
  type DocumentRevision,
  type NoteRevision,
  type NoteSaveResult,
  type ProvenanceExport,
  type RemapReport,
  type SourceLink,
  type SourceLinkResolution,
  type SourceSegment,
} from "@/lib/apiSchemaProvenance";

export const provenanceClient = {
  documentCandidateStage: (candidate: DocumentCandidate): Promise<DocumentCandidate> =>
    invokeParsed("document_candidate_stage", { candidate }, parseDocumentCandidate),
  documentAccept: (paperId: string, candidate: DocumentCandidate): Promise<DocumentRevision> =>
    invokeParsed("document_accept", { paperId, candidate }, parseDocumentRevision),
  documentRevisionsList: (paperId: string): Promise<DocumentRevision[]> =>
    invokeParsed("document_revisions_list", { paperId }, (value, path) =>
      parseArray(value, path, parseDocumentRevision),
    ),
  sourceSegmentList: (paperId: string, revisionId?: string | null): Promise<SourceSegment[]> =>
    invokeParsed("source_segment_list", { paperId, revisionId: revisionId ?? null }, (value, path) =>
      parseArray(value, path, parseSegment),
    ),
  sourceLinkCreate: (
    paperId: string,
    anchorDomain: "note" | "annotation" | "paper",
    anchorId: string,
    segmentId: string,
  ): Promise<SourceLink> =>
    invokeParsed("source_link_create", { paperId, anchorDomain, anchorId, segmentId }, parseSourceLink),
  sourceLinkResolve: (linkId: string): Promise<SourceLinkResolution> =>
    invokeParsed("source_link_resolve", { linkId }, parseSourceLinkResolution),
  sourceLinkListForAnchor: (anchorDomain: "note" | "annotation" | "paper", anchorId: string): Promise<SourceLink[]> =>
    invokeParsed("source_link_list_for_anchor", { anchorDomain, anchorId }, (value, path) =>
      parseArray(value, path, parseSourceLink),
    ),
  backlinksList: (paperId: string, segmentId?: string | null): Promise<BacklinkRow[]> =>
    invokeParsed("backlinks_list", { paperId, segmentId: segmentId ?? null }, (value, path) =>
      parseArray(value, path, parseBacklinkRow),
    ),
  noteRevisionsList: (paperId: string): Promise<NoteRevision[]> =>
    invokeParsed("note_revisions_list", { paperId }, (value, path) =>
      parseArray(value, path, parseNoteRevision),
    ),
  noteSave: (paperId: string, content: string, expectedRevision?: number | null): Promise<NoteSaveResult> =>
    invokeParsed(
      "note_save",
      { paperId, content, expectedRevision: expectedRevision ?? null },
      parseNoteSaveResult,
    ),
  provenanceBackfill: (paperId?: string | null): Promise<BackfillReport> =>
    invokeParsed("provenance_backfill", { paperId: paperId ?? null }, parseBackfillReport),
  provenanceRemap: (paperId?: string | null): Promise<RemapReport> =>
    invokeParsed("provenance_remap", { paperId: paperId ?? null }, parseRemapReport),
  provenanceExport: (paperId?: string | null): Promise<ProvenanceExport> =>
    invokeParsed("provenance_export", { paperId: paperId ?? null }, parseProvenanceExport),
};

export type {
  BackfillReport,
  BacklinkRow,
  CandidateAsset,
  CandidateSegment,
  DocumentCandidate,
  DocumentRevision,
  NoteRevision,
  NoteSaveResult,
  ProvenanceExport,
  RemapReport,
  SourceLink,
  SourceLinkResolution,
  SourceSegment,
} from "@/lib/apiSchemaProvenance";
