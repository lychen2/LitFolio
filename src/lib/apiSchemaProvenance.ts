import type { ResourceRefV1 } from "@/core/contracts";
import { parseResourceRefV1 } from "@/core/contracts";
import {
  booleanField,
  enumStringField,
  field,
  nullableNumberField,
  nullableStringField,
  object,
  parseArray,
  parseNullable,
  numberField,
  schemaError,
  stringArrayField,
  stringField,
  type Shape,
} from "./apiSchemaCore";

const segmentKinds = new Set(["heading", "paragraph", "table", "list", "figure", "code", "quote", "asset"]);
const resolutions = new Set(["current", "moved", "changed", "missing"]);

export type SegmentKind = "heading" | "paragraph" | "table" | "list" | "figure" | "code" | "quote" | "asset";
export type ResolutionStatus = "current" | "moved" | "changed" | "missing";

export interface CandidateSegment {
  kind: SegmentKind;
  markdown: string;
  page: number | null;
  rect: unknown | null;
}

export interface CandidateAsset {
  name: string;
  bytes: number;
}

export interface DocumentCandidate {
  sourceHash: string;
  sourceKind: string;
  sourceUri: string;
  parserOwner: string;
  markdown: string;
  segments: CandidateSegment[];
  assets: CandidateAsset[];
  warnings: string[];
}

export interface SourceSegment {
  segmentId: string;
  resourceRef: ResourceRefV1;
  revisionId: string;
  paperId: string;
  segOrder: number;
  kind: SegmentKind;
  markdown: string;
  page: number | null;
  rect: unknown | null;
  quoteHash: string;
}

export interface DocumentRevision {
  revisionId: string;
  resourceRef: ResourceRefV1;
  paperId: string;
  revision: number;
  sourceHash: string;
  sourceKind: string;
  sourceUri: string;
  parserOwner: string;
  markdown: string;
  segments: SourceSegment[];
  acceptedAt: number;
  active: boolean;
}

export interface SourceLink {
  linkId: string;
  paperId: string;
  anchorDomain: "note" | "annotation" | "paper";
  anchorId: string;
  segmentId: string;
  revisionId: string;
  snapshot: unknown;
  quoteHash: string;
  resolution: ResolutionStatus;
  resolvedRevisionId: string | null;
  resolvedSegmentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SourceLinkResolution {
  status: ResolutionStatus;
  link: SourceLink;
}

export interface BacklinkRow {
  anchorDomain: "note" | "annotation" | "paper";
  anchorId: string;
  segmentId: string;
  resolution: ResolutionStatus;
  updatedAt: number;
}

export interface NoteRevision {
  noteId: string;
  paperId: string;
  revision: number;
  contentHash: string;
  savedAt: number;
}

export interface NoteSaveResult {
  revision: number;
  contentHash: string;
}

export interface BackfillPaperReport {
  paperId: string;
  created: boolean;
  revision: number;
  noteRevision: number;
}

export interface BackfillReport {
  schemaVersion: number;
  papers: BackfillPaperReport[];
  totalPapers: number;
  createdRevisions: number;
}

export interface RemapReport {
  schemaVersion: number;
  paperIds: string[];
  linksRecomputed: number;
  changed: number;
}

export interface ProvenanceRevisionExport {
  revisionId: string;
  resourceRef: ResourceRefV1;
  paperId: string;
  revision: number;
  sourceHash: string;
  sourceKind: string;
  sourceUri: string;
  parserOwner: string;
  markdown: string;
  segments: SourceSegment[];
  active: boolean;
}

export interface ProvenanceLinkExport {
  linkId: string;
  paperId: string;
  anchorDomain: "note" | "annotation" | "paper";
  anchorId: string;
  segmentId: string;
  revisionId: string;
  snapshot: unknown;
  quoteHash: string;
  resolution: ResolutionStatus;
  resolvedRevisionId: string | null;
  resolvedSegmentId: string | null;
}

export interface ProvenancePaperExport {
  paperId: string;
  revisions: ProvenanceRevisionExport[];
  links: ProvenanceLinkExport[];
  backlinkCounts: Record<string, number>;
  remapStatus: string;
}

export interface ProvenanceExport {
  schemaVersion: number;
  targetVersion: number;
  papers: ProvenancePaperExport[];
}

function integerField(obj: Shape, key: string, path: string, minimum = 0): number {
  const value = numberField(obj, key, path);
  if (!Number.isInteger(value) || value < minimum) {
    throw schemaError(`${path}.${key}`, `integer >= ${minimum}`, value);
  }
  return value;
}

function nullableIntegerField(obj: Shape, key: string, path: string, minimum = 0): number | null {
  const value = nullableNumberField(obj, key, path);
  if (value === null) return null;
  if (!Number.isInteger(value) || value < minimum) {
    throw schemaError(`${path}.${key}`, `integer >= ${minimum} or null`, value);
  }
  return value;
}

export function parseSegment(value: unknown, path = "SourceSegment"): SourceSegment {
  const obj = object(value, path);
  return {
    segmentId: stringField(obj, "segmentId", path),
    resourceRef: parseResourceRefV1(field(obj, "resourceRef", path), `${path}.resourceRef`),
    revisionId: stringField(obj, "revisionId", path),
    paperId: stringField(obj, "paperId", path),
    segOrder: integerField(obj, "segOrder", path, 1),
    kind: enumStringField(obj, "kind", path, segmentKinds) as SegmentKind,
    markdown: stringField(obj, "markdown", path),
    page: nullableIntegerField(obj, "page", path, 1),
    rect: parseNullable(field(obj, "rect", path), `${path}.rect`, (item) => item),
    quoteHash: stringField(obj, "quoteHash", path),
  };
}

function parseCandidateSegment(value: unknown, path = "CandidateSegment"): CandidateSegment {
  const obj = object(value, path);
  return {
    kind: enumStringField(obj, "kind", path, segmentKinds) as SegmentKind,
    markdown: stringField(obj, "markdown", path),
    page: nullableIntegerField(obj, "page", path, 1),
    rect: parseNullable(field(obj, "rect", path), `${path}.rect`, (item) => item),
  };
}

function parseCandidateAsset(value: unknown, path = "CandidateAsset"): CandidateAsset {
  const obj = object(value, path);
  return { name: stringField(obj, "name", path), bytes: integerField(obj, "bytes", path) };
}

export function parseDocumentCandidate(value: unknown, path = "DocumentCandidate"): DocumentCandidate {
  const obj = object(value, path);
  return {
    sourceHash: stringField(obj, "sourceHash", path),
    sourceKind: stringField(obj, "sourceKind", path),
    sourceUri: stringField(obj, "sourceUri", path),
    parserOwner: stringField(obj, "parserOwner", path),
    markdown: stringField(obj, "markdown", path),
    segments: parseArray(field(obj, "segments", path), `${path}.segments`, parseCandidateSegment),
    assets: parseArray(field(obj, "assets", path), `${path}.assets`, parseCandidateAsset),
    warnings: stringArrayField(obj, "warnings", path),
  };
}

export function parseDocumentRevision(value: unknown, path = "DocumentRevision"): DocumentRevision {
  const obj = object(value, path);
  return {
    revisionId: stringField(obj, "revisionId", path),
    resourceRef: parseResourceRefV1(field(obj, "resourceRef", path), `${path}.resourceRef`),
    paperId: stringField(obj, "paperId", path),
    revision: integerField(obj, "revision", path, 1),
    sourceHash: stringField(obj, "sourceHash", path),
    sourceKind: stringField(obj, "sourceKind", path),
    sourceUri: stringField(obj, "sourceUri", path),
    parserOwner: stringField(obj, "parserOwner", path),
    markdown: stringField(obj, "markdown", path),
    segments: parseArray(field(obj, "segments", path), `${path}.segments`, parseSegment),
    acceptedAt: numberField(obj, "acceptedAt", path),
    active: booleanField(obj, "active", path),
  };
}

function parseAnchorDomain(obj: Shape, path: string): "note" | "annotation" | "paper" {
  return enumStringField(obj, "anchorDomain", path, new Set(["note", "annotation", "paper"])) as "note" | "annotation" | "paper";
}

export function parseSourceLink(value: unknown, path = "SourceLink"): SourceLink {
  const obj = object(value, path);
  return {
    linkId: stringField(obj, "linkId", path),
    paperId: stringField(obj, "paperId", path),
    anchorDomain: parseAnchorDomain(obj, path),
    anchorId: stringField(obj, "anchorId", path),
    segmentId: stringField(obj, "segmentId", path),
    revisionId: stringField(obj, "revisionId", path),
    snapshot: field(obj, "snapshot", path),
    quoteHash: stringField(obj, "quoteHash", path),
    resolution: enumStringField(obj, "resolution", path, resolutions) as ResolutionStatus,
    resolvedRevisionId: nullableStringField(obj, "resolvedRevisionId", path),
    resolvedSegmentId: nullableStringField(obj, "resolvedSegmentId", path),
    createdAt: numberField(obj, "createdAt", path),
    updatedAt: numberField(obj, "updatedAt", path),
  };
}

export function parseSourceLinkResolution(value: unknown, path = "SourceLinkResolution"): SourceLinkResolution {
  const obj = object(value, path);
  return {
    status: enumStringField(obj, "status", path, resolutions) as ResolutionStatus,
    link: parseSourceLink(field(obj, "link", path), `${path}.link`),
  };
}

export function parseBacklinkRow(value: unknown, path = "BacklinkRow"): BacklinkRow {
  const obj = object(value, path);
  return {
    anchorDomain: parseAnchorDomain(obj, path),
    anchorId: stringField(obj, "anchorId", path),
    segmentId: stringField(obj, "segmentId", path),
    resolution: enumStringField(obj, "resolution", path, resolutions) as ResolutionStatus,
    updatedAt: numberField(obj, "updatedAt", path),
  };
}

export function parseNoteRevision(value: unknown, path = "NoteRevision"): NoteRevision {
  const obj = object(value, path);
  return {
    noteId: stringField(obj, "noteId", path),
    paperId: stringField(obj, "paperId", path),
    revision: integerField(obj, "revision", path, 1),
    contentHash: stringField(obj, "contentHash", path),
    savedAt: numberField(obj, "savedAt", path),
  };
}

export function parseNoteSaveResult(value: unknown, path = "NoteSaveResult"): NoteSaveResult {
  const obj = object(value, path);
  return { revision: integerField(obj, "revision", path, 1), contentHash: stringField(obj, "contentHash", path) };
}

export function parseBackfillPaperReport(value: unknown, path = "BackfillPaperReport"): BackfillPaperReport {
  const obj = object(value, path);
  return {
    paperId: stringField(obj, "paperId", path),
    created: booleanField(obj, "created", path),
    revision: integerField(obj, "revision", path),
    noteRevision: integerField(obj, "noteRevision", path),
  };
}

export function parseBackfillReport(value: unknown, path = "BackfillReport"): BackfillReport {
  const obj = object(value, path);
  return {
    schemaVersion: numberField(obj, "schemaVersion", path),
    papers: parseArray(field(obj, "papers", path), `${path}.papers`, parseBackfillPaperReport),
    totalPapers: numberField(obj, "totalPapers", path),
    createdRevisions: numberField(obj, "createdRevisions", path),
  };
}

export function parseRemapReport(value: unknown, path = "RemapReport"): RemapReport {
  const obj = object(value, path);
  return {
    schemaVersion: numberField(obj, "schemaVersion", path),
    paperIds: stringArrayField(obj, "paperIds", path),
    linksRecomputed: numberField(obj, "linksRecomputed", path),
    changed: numberField(obj, "changed", path),
  };
}

function parseExportRevision(value: unknown, path = "ProvenanceRevisionExport"): ProvenanceRevisionExport {
  const obj = object(value, path);
  return {
    revisionId: stringField(obj, "revisionId", path),
    resourceRef: parseResourceRefV1(field(obj, "resourceRef", path), `${path}.resourceRef`),
    paperId: stringField(obj, "paperId", path),
    revision: integerField(obj, "revision", path, 1),
    sourceHash: stringField(obj, "sourceHash", path),
    sourceKind: stringField(obj, "sourceKind", path),
    sourceUri: stringField(obj, "sourceUri", path),
    parserOwner: stringField(obj, "parserOwner", path),
    markdown: stringField(obj, "markdown", path),
    segments: parseArray(field(obj, "segments", path), `${path}.segments`, parseSegment),
    active: booleanField(obj, "active", path),
  };
}

function parseExportLink(value: unknown, path = "ProvenanceLinkExport"): ProvenanceLinkExport {
  const obj = object(value, path);
  return {
    linkId: stringField(obj, "linkId", path),
    paperId: stringField(obj, "paperId", path),
    anchorDomain: parseAnchorDomain(obj, path),
    anchorId: stringField(obj, "anchorId", path),
    segmentId: stringField(obj, "segmentId", path),
    revisionId: stringField(obj, "revisionId", path),
    snapshot: field(obj, "snapshot", path),
    quoteHash: stringField(obj, "quoteHash", path),
    resolution: enumStringField(obj, "resolution", path, resolutions) as ResolutionStatus,
    resolvedRevisionId: nullableStringField(obj, "resolvedRevisionId", path),
    resolvedSegmentId: nullableStringField(obj, "resolvedSegmentId", path),
  };
}

function parseExportPaper(value: unknown, path = "ProvenancePaperExport"): ProvenancePaperExport {
  const obj = object(value, path);
  const backlinkCountsValue = object(field(obj, "backlinkCounts", path), `${path}.backlinkCounts`);
  const backlinkCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(backlinkCountsValue)) {
    if (typeof count !== "number" || !Number.isFinite(count)) throw schemaError(`${path}.backlinkCounts.${key}`, "finite number", count);
    backlinkCounts[key] = count;
  }
  return {
    paperId: stringField(obj, "paperId", path),
    revisions: parseArray(field(obj, "revisions", path), `${path}.revisions`, parseExportRevision),
    links: parseArray(field(obj, "links", path), `${path}.links`, parseExportLink),
    backlinkCounts,
    remapStatus: stringField(obj, "remapStatus", path),
  };
}

export function parseProvenanceExport(value: unknown, path = "ProvenanceExport"): ProvenanceExport {
  const obj = object(value, path);
  return {
    schemaVersion: numberField(obj, "schemaVersion", path),
    targetVersion: numberField(obj, "targetVersion", path),
    papers: parseArray(field(obj, "papers", path), `${path}.papers`, parseExportPaper),
  };
}
