// Mock Tauri IPC for the screenshot harness. Replaces @tauri-apps/api/core,
// @tauri-apps/api/event, @tauri-apps/plugin-dialog, and @tauri-apps/plugin-shell
// via vite alias when running the screenshot vite server.

import { PAPERS, FOLDERS, TAGS, PROFILES, TASK_ASSIGNMENTS, FEEDS, FEED_ITEMS } from "./seed-data";
import { ARXIV_DRAFTS, TOPIC_REPORT, TOPIC_SURVEY, ASK_RESULT, HIGHLIGHTS, TERMS, GRAPH_DATA, GRAPH_LINKS, CONCEPTS, CONCEPT_RELATIONS, PAPER_CONCEPTS, COMPARISONS, SMART_COLLECTIONS, READING_QUEUE, CUSTOM_FIELD_DEFS, PAPER_CUSTOM_FIELDS, TOPIC_ALERTS, TOPIC_ALERT_RESULTS, SIMILAR_PAPERS, LIT_REVIEW, CITATION_NETWORK, NOTE_SECTIONS, ASK_CONVERSATION } from "./seed-extra";

export type UnlistenFn = () => void;
type Args = Record<string, unknown> | undefined;

const okVoid = () => Promise.resolve(undefined as unknown as void);
const okNull = () => Promise.resolve(null as unknown);
const okArr = () => Promise.resolve([] as unknown);

let cachedPdfBytes: number[] | null = null;
async function loadSamplePdf(): Promise<number[]> {
  if (cachedPdfBytes) return cachedPdfBytes;
  const res = await fetch("/sample.pdf");
  const buf = await res.arrayBuffer();
  cachedPdfBytes = Array.from(new Uint8Array(buf));
  return cachedPdfBytes;
}

const handlers: Record<string, (a: Args) => unknown> = {
  app_version: () => "0.2.0",
  library_root: () => "/home/researcher/Litera-Library",
  papers_count: () => PAPERS.length,
  papers_recent: () => PAPERS,
  papers_search: (a) => {
    const q = String((a?.query ?? "")).toLowerCase().trim();
    if (!q) return PAPERS;
    return PAPERS.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      (p.tldr ?? "").toLowerCase().includes(q) ||
      p.authors.some((au) => au.toLowerCase().includes(q)),
    );
  },
  papers_in_folder: (a) => {
    const id = Number(a?.folderId);
    if (id === 1) return PAPERS.slice(0, 4);
    if (id === 2) return PAPERS.slice(2, 6);
    if (id === 3) return PAPERS.slice(3, 5);
    if (id === 4) return PAPERS.slice(0, 2);
    return PAPERS;
  },
  paper_get: (a) => PAPERS.find((p) => p.id === a?.id) ?? null,
  paper_set_read_status: okVoid,
  paper_delete: okVoid,
  tags_list: () => TAGS,
  tag_create: (a) => ({ id: TAGS.length + 1, name: String(a?.name), parent_id: null, color: (a?.color as string) ?? null }),
  tag_rename: okVoid, tag_set_color: okVoid, tag_delete: okVoid,
  paper_attach_tag: okVoid, paper_detach_tag: okVoid,
  paper_tags: () => [TAGS[0], TAGS[2]],
  folders_list: () => FOLDERS,
  folder_create: (a) => ({ id: FOLDERS.length + 10, name: String(a?.name), parent_id: (a?.parentId as number | null) ?? null }),
  folder_rename: okVoid, folder_delete: okVoid,
  paper_attach_folder: okVoid, paper_detach_folder: okVoid,
  paper_folders: () => [FOLDERS[0]],

  // Ingest --------------------------------------------------------------
  import_doi: () => PAPERS[0], import_arxiv: () => PAPERS[0], import_bibtex: () => [PAPERS[0]],
  import_pdf_files: () => ({ imported: [PAPERS[4]], failed: [] }),
  import_folder: () => ({ imported: PAPERS.slice(0, 3), failed: [] }),
  search_papers: () => TOPIC_REPORT.classic.slice(0, 4),
  search_unified: (a) => {
    const q = String((a?.query ?? "")).toLowerCase().trim();
    if (!q) return [];
    return [
      { source: "paper", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", paper_title: PAPERS[0].title, snippet: PAPERS[0].abstract_text?.slice(0, 120) ?? "", score: 0.95 },
      { source: "highlight", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", paper_title: PAPERS[0].title, snippet: HIGHLIGHTS[0].text, score: 0.88 },
      { source: "term", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", paper_title: PAPERS[0].title, snippet: TERMS[0].term.local_definition, score: 0.82 },
    ];
  },
  add_from_search: () => PAPERS[0], add_many_from_search: () => ({ imported: PAPERS.slice(0, 2), skipped: [] }),
  prepare_doi_draft: () => ARXIV_DRAFTS[0],
  prepare_arxiv_draft: () => ({
    title: "Attention is all you need", authors: ["A. Vaswani", "N. Shazeer", "N. Parmar"],
    year: 2017, venue: "NeurIPS 2017", doi: null, arxiv_id: "1706.03762",
    abstract_text: "We propose the Transformer, a model architecture relying entirely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
  }),
  paper_save_with_pdf: () => PAPERS[0], paper_attach_pdf: () => PAPERS[0], paper_open_pdf: okVoid,
  paper_read_pdf_bytes: () => loadSamplePdf(),

  // arXiv browse --------------------------------------------------------
  arxiv_list_category: (a) => {
    const start = Number(a?.start ?? 0);
    if (start > 0) return [];
    return ARXIV_DRAFTS;
  },
  arxiv_add_draft: () => PAPERS[0], arxiv_add_with_pdf: () => PAPERS[0],

  // AI ------------------------------------------------------------------
  paper_tldr: () => ({ tldr: PAPERS[0].tldr, key_findings: PAPERS[0].key_findings, model: "deepseek-chat", prompt_tokens: 1850, completion_tokens: 180 }),
  paper_quick_read: () => ({ problem: PAPERS[0].research_question, method: PAPERS[0].method, comparison: PAPERS[0].comparison, limitations: PAPERS[0].limitations, model: "deepseek-reasoner", prompt_tokens: 2680, completion_tokens: 720 }),
  paper_translate: () => ({ title: PAPERS[0].title_translated, abstract_text: PAPERS[0].abstract_translated, target_lang: "Chinese", model: "qwen2.5:14b", prompt_tokens: 410, completion_tokens: 280 }),
  draft_translate: () => ({ title: "注意力即一切", abstract_text: "我们提出了 Transformer，一种完全依赖注意力机制的模型架构……", target_lang: "Chinese", model: "qwen2.5:14b", prompt_tokens: 230, completion_tokens: 180 }),
  batch_tldr: () => ({ kind: "tldr", total: 3, ok: 3, failed: 0, cancelled: false, errors: [] }),
  batch_quick_read: () => ({ kind: "quick_read", total: 3, ok: 3, failed: 0, cancelled: false, errors: [] }),
  batch_translate: () => ({ kind: "translate", total: 3, ok: 3, failed: 0, cancelled: false, errors: [] }),
  batch_attach_tag: () => 3, batch_set_status: () => 3, batch_delete: () => 3, batch_cancel: () => true,

  // Topic ---------------------------------------------------------------
  topic_discover: () => TOPIC_REPORT,
  search_expand_query: () => ({ original: "极端超短脉冲", expanded: "few-cycle ultrashort laser pulses", terms: ["few-cycle pulse", "post-compression", "attosecond physics"], model: "deepseek-chat", prompt_tokens: 220, completion_tokens: 80 }),
  topic_survey: async () => {
    // Drive progress events the way the real backend would.
    setTimeout(() => emit("topic-survey-progress", { phase: "planning" as const }), 50);
    setTimeout(() => emit("topic-survey-progress", { phase: "grounding" as const, subarea_total: 3 }), 150);
    setTimeout(() => emit("topic-survey-progress", { phase: "annotating" as const }), 250);
    await new Promise((r) => setTimeout(r, 300));
    emit("topic-survey-progress", { phase: "done" as const });
    return TOPIC_SURVEY;
  },

  // Library ask ---------------------------------------------------------
  ask_save_as_note: () => ({ path: "/home/researcher/Litera-Library/notes/ask/2026-05-26-chirped-pulse-amplification.md" }),

  // Reader --------------------------------------------------------------
  highlight_list: () => HIGHLIGHTS,
  highlight_create: (a) => ({ id: `h${Date.now()}`, paper_id: String(a?.paperId), page: Number(a?.page ?? 1), rect: a?.rect, color: (a?.color as string) ?? "#fbbf24", label: (a?.label as string) ?? null, text: String(a?.text ?? ""), note: null, summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: Math.floor(Date.now() / 1000) }),
  highlight_update_note: okVoid, highlight_update_label: okVoid, highlight_summarize: () => HIGHLIGHTS[1], highlight_translate: () => HIGHLIGHTS[1], highlight_delete: okVoid,
  note_get: () => "## 速读\n\n这篇文章主要贡献是把元表面 inverse design 包到 LLM agent 里。\n\n## 重要数字\n\n- 8.3 轮平均收敛\n- failure recovery 让尝试次数 -41%\n- FDTD 单步耗时 3 min 仍是瓶颈\n\n## 待跟进\n\n- [ ] 验证在介观尺度结构上的表现\n- [ ] 比较 agentic 框架与传统 topology optimization 的成本\n",
  note_save: okVoid,
  reader_translate_selection: () => ({
    translation: "我们用一个可学习的门控层替换 4 个长文档问答骨干里的交叉注意力，结果显示在 8 个基准中 6 个保持统计相同的精度，同时节省 23% FLOPs。",
    terms: [
      { term: "cross-attention", local_definition: "在编码器输出和解码器之间提供键值对查询的注意力子层。", local_evidence: "见 §2 cross-attention 子层", linked_papers: [{ paper_id: "01PAP4", title: "Attention is all you need", year: 2017, relation: "原始引入了 cross-attention 概念", snippet: "Cross-attention computes queries from the decoder and keys/values from the encoder output." }] },
      { term: "gating layer", local_definition: "一组按输入动态产生权重的可学习门，决定特征向量的哪些维度通过。", local_evidence: "Figure 3 gating block", linked_papers: [] },
    ],
    model: "deepseek-reasoner", prompt_tokens: 410, completion_tokens: 220,
  }),
  paper_terms_list: () => TERMS, paper_terms_generate: () => TERMS,
  paper_term_add: (a) => ({ term: { id: 999, paper_id: String(a?.paperId), term: String(a?.term ?? ""), normalized_term: String(a?.term ?? "").toLowerCase(), local_definition: String(a?.definition ?? ""), local_evidence: String(a?.evidence ?? ""), score: 0.5, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) }, related: [] }),
  paper_term_delete: okVoid, paper_set_pdf_text: okVoid,

  // Knowledge graph -----------------------------------------------------
  graph_data: () => GRAPH_DATA,
  paper_link_create: (a) => ({ id: 99, source_paper_id: String(a?.sourcePaperId), target_paper_id: String(a?.targetPaperId), relation: String(a?.relation ?? "related"), source_type: "user", confidence: 1.0, snippet: (a?.snippet as string) ?? null, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) }),
  paper_link_delete: okVoid,
  paper_links_for_paper: (a) => GRAPH_LINKS.filter((l) => l.source_paper_id === a?.paperId || l.target_paper_id === a?.paperId),
  ai_discover_links: () => ({ total: 2, accepted: 0, rejected: 0, skipped: 0 }),
  ai_accept_link: okVoid,
  ai_reject_link: okVoid,

  // Settings ------------------------------------------------------------
  llm_get_config: () => ({ profiles: PROFILES, active: "DeepSeek", task_assignments: TASK_ASSIGNMENTS, output_language: "Chinese" }),
  llm_save_config: okVoid,
  llm_test: (a) => ({ ok: true, model: String((a?.profile as { chat_model?: string })?.chat_model ?? "unknown"), reply: "pong" }),
  llm_list_models: () => ["deepseek-chat", "deepseek-reasoner", "deepseek-coder-v2"],

  // Feeds ---------------------------------------------------------------
  feeds_list: () => FEEDS,
  feed_add: (a) => ({ id: FEEDS.length + 1, url: String(a?.url), title: "新订阅源", description: null, etag: null, last_modified: null, last_fetched_at: Math.floor(Date.now() / 1000), last_error: null, created_at: Math.floor(Date.now() / 1000), total_items: 0, unread_items: 0 }),
  feed_remove: okVoid,
  feed_refresh: () => ({ new_items: 2, not_modified: false }),
  feed_refresh_all: () => ({ refreshed: 1, unchanged: 2, failed: 0, new_items: 2, errors: [] }),
  feed_items_list: (a) => {
    const onlyUnread = a?.onlyUnread === true;
    const feedId = a?.feedId as number | null | undefined;
    return FEED_ITEMS.filter((it) => (onlyUnread ? !it.seen : true) && (feedId == null || it.feed_id === feedId));
  },
  feed_item_set_seen: okVoid, feed_mark_all_seen: okVoid, feed_item_link_paper: okVoid,

  // Sync ----------------------------------------------------------------
  sync_get_config: () => ({ webdav: { base_url: "https://dav.example.org", remote_path: "/litera/", username: "researcher", password: "•••••••" } }),
  sync_save_config: okVoid,
  sync_test: () => ({ remote_root: "https://dav.example.org/litera/" }),
  sync_push_library: () => ({ remote_root: "https://dav.example.org/litera/", file_count: 138, total_bytes: 412_881_233, restart_required: false }),
  sync_pull_library: () => ({ remote_root: "https://dav.example.org/litera/", file_count: 138, total_bytes: 412_881_233, restart_required: true }),

  // Concepts ------------------------------------------------------------
  concepts_list: () => CONCEPTS,
  concept_create: (a) => ({ id: CONCEPTS.length + 1, name: String(a?.name), description: (a?.description as string) ?? null, source: "user", created_at: Math.floor(Date.now() / 1000) }),
  concept_delete: okVoid,
  concept_relations_list: () => CONCEPT_RELATIONS,
  concept_relation_create: (a) => ({ id: CONCEPT_RELATIONS.length + 1, source_concept_id: Number(a?.sourceId), target_concept_id: Number(a?.targetId), relation: String(a?.relation), evidence_paper_id: (a?.evidencePaperId as string) ?? null, snippet: (a?.snippet as string) ?? null, created_at: Math.floor(Date.now() / 1000) }),
  concept_relation_delete: okVoid,
  concept_link_paper: okVoid,
  concept_unlink_paper: okVoid,
  concept_for_paper: (a) => PAPER_CONCEPTS.filter((pc) => pc.paper_id === a?.paperId),
  concept_extract_from_paper: () => [
    { name: "agentic design loop", description: "LLM 驱动的设计-评估-修正闭环", relations: [{ target: "language model", relation: "uses", snippet: "Agent uses LLM for design proposals" }] },
    { name: "FDTD evaluation", description: "时域有限差分仿真评估方法", relations: [{ target: "metasurface", relation: "evaluates", snippet: "FDTD evaluates metasurface spectral response" }] },
  ],
  concept_extract_and_store: () => 2,
  concepts_for_graph: () => GRAPH_DATA,

  // Comparisons ---------------------------------------------------------
  paper_compare: () => COMPARISONS[0],
  paper_comparisons_list: () => COMPARISONS,
  paper_comparison_get: (a) => COMPARISONS.find((c) => c.id === Number(a?.id)) ?? null,
  paper_comparison_create: (a) => COMPARISONS.length + 1,
  paper_comparison_update: okVoid,
  paper_comparison_delete: okVoid,

  // Smart Collections ---------------------------------------------------
  smart_collections_list: () => SMART_COLLECTIONS,
  smart_collection_create: (a) => ({ id: SMART_COLLECTIONS.length + 1, name: String(a?.name), rules: a?.rules, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) }),
  smart_collection_update: okVoid,
  smart_collection_delete: okVoid,
  smart_collection_query: () => PAPERS.slice(0, 3),
  smart_collection_query_papers: () => PAPERS.slice(0, 3),

  // Reading Queue -------------------------------------------------------
  queue_list: () => READING_QUEUE,
  queue_add: okVoid,
  queue_remove: okVoid,
  queue_reorder: okVoid,
  queue_update: okVoid,

  // Custom Fields -------------------------------------------------------
  custom_field_defs_list: () => CUSTOM_FIELD_DEFS,
  custom_field_def_create: (a) => ({ id: CUSTOM_FIELD_DEFS.length + 1, name: String(a?.name), field_type: String(a?.fieldType), options: (a?.options as string[]) ?? null, created_at: Math.floor(Date.now() / 1000) }),
  custom_field_def_delete: okVoid,
  paper_custom_fields_get: () => PAPER_CUSTOM_FIELDS,
  paper_custom_field_set: okVoid,
  paper_custom_field_delete: okVoid,

  // Topic Alerts --------------------------------------------------------
  topic_alerts_list: () => TOPIC_ALERTS,
  topic_alert_create: (a) => ({ id: TOPIC_ALERTS.length + 1, query: String(a?.query), frequency: String(a?.frequency), target_folder_id: (a?.targetFolderId as number) ?? null, auto_import: (a?.autoImport as boolean) ?? false, last_run_at: null, created_at: Math.floor(Date.now() / 1000) }),
  topic_alert_update: okVoid,
  topic_alert_delete: okVoid,
  topic_alert_results: (a) => TOPIC_ALERT_RESULTS.filter((r) => r.alert_id === Number(a?.alertId)),
  topic_alert_results_list: (a) => TOPIC_ALERT_RESULTS.filter((r) => r.alert_id === Number(a?.alertId)),
  topic_alert_result_mark_seen: okVoid,
  topic_alert_mark_all_seen: okVoid,
  topic_alert_unseen_count: () => TOPIC_ALERT_RESULTS.filter((r) => !r.seen).length,
  topic_alert_run: () => 1,
  topic_alert_run_all: () => 2,

  // Similar Papers ------------------------------------------------------
  paper_similar: () => SIMILAR_PAPERS,

  // Literature Review ---------------------------------------------------
  generate_lit_review: () => LIT_REVIEW,

  // Export --------------------------------------------------------------
  export_markdown_dir: () => "/home/researcher/Documents/LitFolio-Export",
  export_markdown_all: () => ({ exported: 6, skipped: 0, errors: [] }),
  export_markdown_paper: (a) => {
    const p = PAPERS.find((pp) => pp.id === a?.paperId);
    return p ? `# ${p.title}\n\n${p.abstract_text ?? ""}` : null;
  },
  export_citations: () => `@article{liu2025agentic,
  title={Agentic metasurface design with self-correcting language-model loops},
  author={Liu, Z. and Hassan, M. and Tanaka, K. and Park, J.},
  journal={Nature Photonics},
  year={2025}
}`,
  bibtex_backfill: () => 3,

  // Dedup ---------------------------------------------------------------
  paper_find_duplicate: () => null,
  paper_find_duplicates: () => null,
  paper_scan_duplicates: () => [],
  paper_merge: okVoid,

  // Note Sections -------------------------------------------------------
  note_sections_get: () => NOTE_SECTIONS,
  note_sections_save: okVoid,
  note_sections_reorder: okVoid,
  note_section_delete: okVoid,

  // Citations -----------------------------------------------------------
  paper_citations: () => CITATION_NETWORK,

  // Ask multi-turn (override the simple handler) ------------------------
  library_ask: (a) => {
    const history = a?.conversationHistory as { role: string; content: string }[] | undefined;
    if (history && history.length > 0) {
      // Follow-up question: return the second answer from our seeded conversation
      return {
        question: String(a?.question ?? ""),
        answer: ASK_CONVERSATION[ASK_CONVERSATION.length - 1].content,
        sources: [
          { paper_id: "hpa1", title: "Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression", year: 2021, authors: ["F. Krausz"], snippet: "We push CPA-amplified mJ-class pulses through gas-filled hollow-core fibers and demonstrate sub-4-fs compression." },
          { paper_id: "hpa2", title: "Multi-pass cell compression with 0.5 mJ output at 6 fs", year: 2022, authors: ["A. Vernaleken"], snippet: "Direct CPA at sub-10-fs is currently infeasible; our results illustrate the energy-duration trade-off." },
          { paper_id: "hpa3", title: "Solid-state thin-plate post-compression below 5 fs", year: 2023, authors: ["A. L'Huillier"], snippet: "Thin solid plates as an attractive alternative to gas-filled fibers for post-compression." },
        ],
        model: "deepseek-chat", prompt_tokens: 3200, completion_tokens: 680,
        terms: ["hollow-core fiber post-compression", "sub-4-fs pulse generation", "cascaded compression"], retrieved_count: 3,
      };
    }
    return ASK_RESULT;
  },

  // Markdown export settings --------------------------------------------
  export_markdown_set_dir: okVoid,
};

export async function invoke<T>(cmd: string, args?: Args): Promise<T> {
  const h = handlers[cmd];
  if (!h) {
    console.warn("[mock-tauri] unhandled invoke:", cmd, args);
    return null as unknown as T;
  }
  const out = await Promise.resolve(h(args));
  return out as T;
}

// Event subscription (used by topic-survey-progress only).
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
export function listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<UnlistenFn> {
  const set = listeners.get(name) ?? new Set();
  set.add(cb as Listener);
  listeners.set(name, set);
  return Promise.resolve(() => set.delete(cb as Listener));
}
function emit(name: string, payload: unknown) {
  listeners.get(name)?.forEach((cb) => cb({ payload }));
}

// Plugin shims --------------------------------------------------------
export async function open(opts?: unknown): Promise<string | string[] | null> {
  const o = (opts ?? {}) as { multiple?: boolean };
  return o.multiple ? ["/home/researcher/Downloads/attention-is-all-you-need.pdf"] : "/home/researcher/Downloads/attention-is-all-you-need.pdf";
}
