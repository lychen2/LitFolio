import type {
  FeedItem,
  JobRecord,
  LlmConfig,
  Paper,
  PdfTextNote,
  QuickReadResult,
} from "@/lib/api";
import type { LiteratureNetwork } from "@/features/literature-network/network";
import { pluginRegistry } from "@/host/profileRegistry";
import { parseLlmConfig } from "@/lib/apiSchema";
import { field, object, stringArrayField } from "@/lib/apiSchemaCore";

const now = 1_779_999_999;

/**
 * The browser harness has no Rust side, so the reader frame points at a
 * loopback origin the Playwright spec serves. Any other port would be a real
 * listener on the developer machine, so the fixture stays on the discard port.
 */
const READING_SERVICE_ORIGIN = "http://127.0.0.1:9";
const PICKED_PDF_URI = "content://com.android.providers.downloads.documents/document/msf%3A42";

function readingServiceUrl(paperId: string): string {
  return paperId ? `${READING_SERVICE_ORIGIN}/read/${paperId}` : `${READING_SERVICE_ORIGIN}/`;
}

export const mockPaper: Paper = {
  id: "paper-1",
  title: "Browser Smoke Paper",
  authors: ["Ada Lovelace"],
  year: 2026,
  venue: "LitFolio E2E",
  doi: "10.1145/3530819",
  arxiv_id: null,
  abstract_text: "Fixture paper used by Playwright smoke tests.",
  pdf_path: null,
  note_path: null,
  added_at: now,
  updated_at: now,
  read_status: "unread",
  tldr: null,
  research_question: null,
  method: null,
  dataset: null,
  key_findings: [],
  limitations: null,
  comparison: null,
  title_translated: null,
  abstract_translated: null,
  translate_target_lang: null,
  translated_at: null,
  bibtex: null,
};

const mockLiteratureNetwork: LiteratureNetwork = {
  nodes: [
    {
      id: "W1", title: mockPaper.title, authors: mockPaper.authors, year: mockPaper.year,
      venue: mockPaper.venue, doi: mockPaper.doi, arxivId: null, url: "https://openalex.org/W1",
      libraryPaperId: mockPaper.id, isSeed: true, groupId: "T1", citationCount: 10, score: 0,
    },
    {
      id: "W2", title: "Related Network Paper", authors: ["Grace Hopper"], year: 2025,
      venue: null, doi: null, arxivId: null, url: "https://openalex.org/W2",
      libraryPaperId: null, isSeed: false, groupId: "T2", citationCount: 4, score: 9,
    },
  ],
  edges: [
    {
      source: "W1", target: "W2", kind: "citation",
      evidence: [{ id: "W1", title: mockPaper.title, url: "https://openalex.org/W1" }],
    },
    {
      source: "W1", target: "W2", kind: "shared_reference",
      evidence: [{ id: "W3", title: "Common Reference Paper", url: "https://openalex.org/W3" }],
    },
  ],
  groups: [
    { id: "T1", label: "Citation Networks", nodeIds: ["W1"] },
    { id: "T2", label: "Reference Matching", nodeIds: ["W2"] },
  ],
  unresolvedSeedIds: [],
};

const mockReaderPaper: Paper = {
  ...mockPaper,
  id: "paper-reader",
  title: "Reader Comparison Fixture",
  doi: null,
  abstract_text: "A fixture for the local text and PDF comparison flow.",
  pdf_path: "/e2e/fixtures/reader.pdf",
};

export const mockLlmConfig: LlmConfig = {
  profiles: [],
  active: null,
  task_assignments: {
    tldr: null,
    quick_read: null,
    translate: null,
    tag: null,
    link: null,
    topic_survey: null,
    ask: null,
    lit_review: null,
  },
  output_language: "Chinese",
  pdf_markdown: { engine: "local", mineru_token: "" },
  obsidian: { vault_dir: "", folder: "Papers" },
};

export const mockPdfTextNote: PdfTextNote = {
  kind: "text-note",
  id: "pdf-note-1",
  paperId: mockPaper.id,
  rect: { page: 1, x: 24, y: 48, width: 220, height: 120 },
  content: "Browser smoke annotation",
  color: "#fff3a3",
  fontSize: 12,
  opacity: 0.9,
  revision: 0,
  createdAt: now,
  updatedAt: now,
};

export const mockQuickReadResult: QuickReadResult = {
  problem: "Test problem",
  method: "Test method",
  comparison: "Test comparison",
  limitations: "Test limitation",
  model: "mock-model",
  prompt_tokens: 0,
  completion_tokens: 0,
};

export const mockJobRecord: JobRecord = {
  id: "job_01",
  kind: "folder_import",
  scope: null,
  title: "Import folder",
  status: "queued",
  details: {},
  progress_current: 0,
  progress_total: 0,
  error: null,
  attempts: 0,
  max_attempts: 1,
  created_at: now,
  updated_at: now,
  started_at: null,
  finished_at: null,
};

const mockProvenanceRef = {
  contractVersion: "target-mono-v1",
  resource: { contractVersion: "target-mono-v1", domain: "document-revision", id: "rev-paper-1-1" },
  revision: { kind: "number", value: "1" },
};
const mockProvenanceSegment = {
  segmentId: "rev-paper-1-1:1",
  resourceRef: {
    ...mockProvenanceRef,
    resource: { ...mockProvenanceRef.resource, domain: "source-segment", id: "rev-paper-1-1:1" },
  },
  revisionId: "rev-paper-1-1",
  paperId: "paper-1",
  segOrder: 1,
  kind: "paragraph",
  markdown: "A source paragraph.",
  page: 1,
  rect: null,
  quoteHash: "quote-hash",
};
const mockDocumentCandidate = {
  sourceHash: "source-hash",
  sourceKind: "markdown",
  sourceUri: "paper://paper-1",
  parserOwner: "core-test",
  markdown: "# Paper",
  segments: [{ kind: "paragraph", markdown: "A source paragraph.", page: 1, rect: null }],
  assets: [],
  warnings: [],
};
const mockDocumentRevision = {
  revisionId: "rev-paper-1-1",
  resourceRef: mockProvenanceRef,
  paperId: "paper-1",
  revision: 1,
  sourceHash: "source-hash",
  sourceKind: "markdown",
  sourceUri: "paper://paper-1",
  parserOwner: "core-test",
  markdown: "# Paper",
  segments: [mockProvenanceSegment],
  acceptedAt: now,
  active: true,
};
const mockSourceLink = {
  linkId: "link-1",
  paperId: "paper-1",
  anchorDomain: "note",
  anchorId: "note-paper-1",
  segmentId: "rev-paper-1-1:1",
  revisionId: "rev-paper-1-1",
  snapshot: { page: 1, geometry: null, type: "paragraph", text: "A source paragraph.", markdown: "A source paragraph.", asset: null },
  quoteHash: "quote-hash",
  resolution: "current",
  resolvedRevisionId: "rev-paper-1-1",
  resolvedSegmentId: "rev-paper-1-1:1",
  createdAt: now,
  updatedAt: now,
};
type MockResolver = (args?: unknown) => unknown;
const commandFixtures = new Map<string, MockResolver>([
  ["papers_recent", () => [mockPaper]],
  ["pdf_document_names", (args) => {
    const command = "pdf_document_names";
    const uris = stringArrayField(object(args, command), "uris", command);
    return uris.map((uri) => uri === PICKED_PDF_URI ? "reading-check.pdf" : null);
  }],
  ["import_pdf_files", (args) => {
    const command = "import_pdf_files";
    const paths = stringArrayField(object(args, command), "paths", command);
    if (paths.length !== 1 || paths[0] !== PICKED_PDF_URI) {
      throw new Error("PDF import must receive the selected content URI unchanged");
    }
    return { imported: [mockPaper], failed: [] };
  }],
  ["literature_network", (args) => {
    const path = "literature_network";
    const ids = stringArrayField(object(args, path), "paperIds", path);
    const unresolvedSeedIds = ids.filter((id) => id !== mockPaper.id);
    if (ids.includes(mockPaper.id)) return { ...mockLiteratureNetwork, unresolvedSeedIds };
    return { nodes: [], edges: [], groups: [], unresolvedSeedIds } satisfies LiteratureNetwork;
  }],
  ["literature_network_translate_titles", (args) => {
    const path = "literature_network_translate_titles";
    const titles = stringArrayField(object(args, path), "titles", path);
    const translations = new Map([
      [mockPaper.title, "浏览器测试论文"],
      ["Related Network Paper", "相关网络论文"],
      ["Common Reference Paper", "共同参考文献"],
    ]);
    return titles.map((title) => translations.get(title) ?? null);
  }],
  ["feeds_list", () => Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    url: `https://example.org/journal/${index + 1}/rss`,
    title: index === 0 ? "Photonics and Nanostructures – Fundamentals and Applications" : `Journal ${index + 1}`,
    description: null,
    etag: null,
    last_modified: null,
    last_fetched_at: null,
    last_error: null,
    created_at: now,
    total_items: index === 0 ? 2 : 0,
    unread_items: index === 0 ? 2 : 0,
    impact_factor: index === 0 ? 3.5 : null,
  }))],
  ["feed_items_list", (args) => {
    const input = object(args, "feed_items_list");
    if (input.feedId != null && input.feedId !== 1) return [];
    const items: FeedItem[] = ["Newly added article", "Earlier article"].map((title, index) => ({
      id: `rss-item-${index}`,
      feed_id: 1,
      entry_id: `rss-entry-${index}`,
      title,
      link: null,
      summary: null,
      authors: [],
      published_at: null,
      fetched_at: now - index,
      seen: false,
      imported_paper_id: null,
      metadata: null,
      metadata_source: null,
      metadata_checked_at: null,
    }));
    return input.sort === "oldest" ? items.reverse() : items;
  }],
  ["plugin_host_list", () =>
    ["discovery-feeds", "candidate-inbox", "literature-network", "updates"].map((id, i) => ({
      manifest: pluginRegistry.find((manifest) => manifest.id === id),
      enabled: true,
      generation: i + 1,
    })).filter((e) => e.manifest != null),
  ],
  ["plugin_host_enable", () => ({ bindingId: "bind-fixture-local-1-test" })],
  ["plugin_host_disable", () => null],
  ["document_candidate_stage", () => mockDocumentCandidate],
  ["document_accept", () => mockDocumentRevision],
  ["document_revisions_list", () => [mockDocumentRevision]],
  ["source_segment_list", () => [mockProvenanceSegment]],
  ["source_link_create", () => mockSourceLink],
  ["source_link_resolve", () => ({ status: "current", link: mockSourceLink })],
  ["source_link_list_for_anchor", () => [mockSourceLink]],
  ["backlinks_list", () => []],
  ["note_revisions_list", () => []],
  ["note_save", () => ({ revision: 1, contentHash: "content-hash" })],
  ["provenance_backfill", () => ({ schemaVersion: 1, papers: [], totalPapers: 0, createdRevisions: 0 })],
  ["provenance_remap", () => ({ schemaVersion: 1, paperIds: [], linksRecomputed: 0, changed: 0 })],
  ["provenance_export", () => ({ schemaVersion: 1, targetVersion: 1, papers: [] })],
  ["paper_get", () => mockPaper],
  ["paper_delete", () => undefined],
  ["paper_quick_read", () => mockQuickReadResult],
  ["paper_find_by_doi", () => mockPaper],
  ["paper_translated_markdown_get", () => null],
  ["paper_markdown_get", () => "<!-- page:1 -->\n# Reader Comparison Fixture\n\n<!-- page:2 -->\nThe original paragraph remains readable offline."],
  ["paper_pdf_asset_path", () => "/e2e/fixtures/reader.pdf"],
  ["highlight_list", () => []],
  ["paper_terms_list", () => []],
  ["paper_set_pdf_text", () => null],
  ["note_sections_get", () => []],
  ["paper_translate_markdown_estimate", () => ({
    source_chars: 1200,
    cleaned_chars: 1000,
    chunk_count: 2,
  })],
  ["paper_translate_markdown", () => ({
    markdown: "# Reader Comparison Fixture\n\nThe translated paragraph can be compared with the original.",
    target_lang: "English",
    model: "mock-model",
    prompt_tokens: 0,
    completion_tokens: 0,
    cached: false,
  })],
  ["highlight_update_rect", () => null],
  ["pdf_note_create", () => mockPdfTextNote],
  ["pdf_note_list", () => [mockPdfTextNote]],
  ["pdf_note_update", () => ({ ...mockPdfTextNote, revision: 1 })],
  ["pdf_note_delete", () => null],
  ["pdf_note_search", () => [{ note: mockPdfTextNote, snippet: mockPdfTextNote.content }]],
  ["legacy_reader_notes_preview", () => ({
    schemaVersion: 1,
    targetVersion: 1,
    totalSentinelRows: 0,
    alreadyConverted: 0,
    convertible: 0,
    paperIds: [],
  })],
  ["legacy_reader_notes_export", () => ({
    schemaVersion: 1,
    targetVersion: 1,
    destination: "/tmp/legacy-note-export",
    verifiedBackupPath: "/tmp/legacy-note-export/backup/legacy-notes-0",
    sourceRows: 0,
    converted: 0,
    alreadyConverted: 0,
    failed: 0,
    defaultedStyles: 0,
    markdownFiles: 0,
    sectionFiles: 0,
    emptyDefaultSections: 0,
    rollbackState: "committed",
  })],
  ["papers_count", () => 1],
  ["library_root", () => "/tmp/litfolio-test"],
  ["diagnostics_export_log", () => "/tmp/litfolio-diagnostics.log"],
  ["jobs_list", () => []],
  ["job_create", () => mockJobRecord],
  ["job_start", () => ({ ...mockJobRecord, status: "running" })],
  ["job_update_progress", () => ({ ...mockJobRecord, progress_current: 1, progress_total: 1 })],
  ["job_succeed", () => ({ ...mockJobRecord, status: "succeeded" })],
  ["job_fail", () => ({ ...mockJobRecord, status: "failed", error: "failed" })],
  ["job_cancel", () => ({ ...mockJobRecord, status: "cancelled" })],
  ["job_retry", () => ({ ...mockJobRecord, attempts: 1 })],
  ["folders_list", () => []],
  ["papers_batch_tags", () => ({})],
  ["llm_get_config", () => mockLlmConfig],
  ["reading_service_sync", () => null],
  ["reading_service_position_note_ime", () => null],
  ["llm_test", () => ({ ok: true, model: "mock-model", reply: "pong" })],
  ["llm_list_models", () => []],
  ["llm_pull_model", () => "Model pulled successfully"],
]);

export const registeredMockCommands = [...commandFixtures.keys()].sort();

export function invokeMockCommand<T = unknown>(command: string, args?: unknown): T {
  if (command === "plugin:dialog|open") {
    const options = object(field(object(args, command), "options", command), command);
    return (options.multiple === true ? [PICKED_PDF_URI] : PICKED_PDF_URI) as T;
  }
  if (command === "plugin:opener|reveal_item_in_dir") {
    stringArrayField(object(args, command), "paths", command);
    return undefined as T;
  }
  if (command === "reading_service_open") {
    const input = object(args, "reading_service_open");
    const id = input.id;
    return { url: readingServiceUrl(typeof id === "string" ? id : "") } as T;
  }
  if (command === "paper_get") {
    const input = object(args, "paper_get");
    const id = field(input, "id", "paper_get");
    if (id === "paper-cached") return { ...mockReaderPaper, id, title: "Cached Reader Fixture" } as T;
    return (id === mockReaderPaper.id ? mockReaderPaper : mockPaper) as T;
  }
  if (command === "paper_translated_markdown_get") {
    const input = object(args, "paper_translated_markdown_get");
    if (field(input, "paperId", "paper_translated_markdown_get") === "paper-cached") {
      return {
        markdown: "# Cached Reader Fixture\n\nThe saved translation appears without another model call.",
        target_lang: "English", model: "mock-model", prompt_tokens: 0, completion_tokens: 0, cached: true,
      } as T;
    }
  }
  if (command === "llm_save_config") {
    const input = object(args, "llm_save_config");
    Object.assign(mockLlmConfig, parseLlmConfig(field(input, "config", "llm_save_config")));
    return undefined as T;
  }
  const resolver = commandFixtures.get(command);
  if (!resolver) {
    throw unhandledTauriCommandError(command);
  }
  return resolver(args) as T;
}

export function unhandledTauriCommandError(command: string): Error {
  return new Error(
    `Unhandled test Tauri command: ${command}. Registered mock commands: ${registeredMockCommands.join(
      ", "
    )}`
  );
}
