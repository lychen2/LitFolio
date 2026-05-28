// Seed data for the screenshot harness. Every page render reads from here so
// the captured PNGs look like a real researcher's library.

const now = Math.floor(Date.now() / 1000);
const day = 86400;

export const PAPERS = [
  {
    id: "01KSCN65XF4B2PZ83D27ET55PX",
    title: "Agentic metasurface design with self-correcting language-model loops",
    authors: ["Z. Liu", "M. Hassan", "K. Tanaka", "J. Park"],
    year: 2025, venue: "Nature Photonics", doi: "10.1038/s41566-024-01567-2", arxiv_id: "2411.04321",
    abstract_text: "We introduce a closed-loop agentic framework where a large language model proposes metasurface unit-cell parameters, runs full-wave FDTD evaluation, ingests the spectrum, and corrects its own design over multiple rounds. On three benchmark targets (polarization-independent absorber, broadband transmissive lens, achromatic vortex plate), our system reaches the human-expert baseline in 8.3 iterations on average, including failure-recovery loops. We release the prompts, the evaluator harness, and 2k labeled designs.",
    pdf_path: "/home/user/Litera-Library/papers/01KSCN65XF4B2PZ83D27ET55PX/original.pdf",
    note_path: "/home/user/Litera-Library/papers/01KSCN65XF4B2PZ83D27ET55PX/note.md",
    added_at: now - 2 * day, updated_at: now - 1 * day,
    read_status: "reading" as const,
    tldr: "把元表面设计交给 LLM 智能体，由它自己迭代调用 FDTD 评估并反复修正，8 轮内达到人类专家基线。",
    research_question: "能不能让 LLM 自己跑设计-评估-修正的闭环，把元表面 inverse design 从人类专家迭代里解放出来？",
    method: "Agent 维护设计上下文，依次输出参数 JSON → 调 FDTD 评估 → 解析谱线 → 自我反思 → 下一轮。包含失败回滚和 budget 控制。",
    dataset: "2k 配对设计 + 三个 benchmark 目标谱线",
    key_findings: [
      "在 3 个基准目标上 8.3 轮收敛到专家基线",
      "失败回滚机制让平均尝试次数下降 41%",
      "推理预算和最终质量成对数关系",
    ],
    limitations: "受限于 FDTD 仿真耗时 (~3 min/iter)；目前只验证亚波长结构，对介观尺度未测。",
    comparison: "对比传统拓扑优化和 GAN-based inverse design，agentic 框架在多目标稀疏标签场景下更稳健，但单目标密集数据下传统方法仍更快。",
    title_translated: "用自我修正语言模型循环做智能体元表面设计",
    abstract_translated: "我们提出了一种闭环 agentic 框架：大语言模型给出元表面单元参数，跑完整的 FDTD 评估，吸收频谱反馈，并通过多轮自我修正改进设计。",
    translate_target_lang: "Chinese", translated_at: now - 1 * day,
  },
  paper("01PAP2", "Cross-attention is overrated for long-document QA",
    ["A. Chen", "R. Müller"], 2024, "EMNLP 2024", "10.18653/v1/2024.emnlp-117", null,
    "We replace cross-attention in 4 long-document QA backbones with a learnable gating layer and show no statistically significant drop on 6/8 benchmarks while saving 23% FLOPs.", "must", "/orig.pdf", 4 * day),
  paper("01PAP3", "Denoising diffusion probabilistic models",
    ["J. Ho", "A. Jain", "P. Abbeel"], 2020, "NeurIPS 2020", null, "2006.11239",
    "We present diffusion models as a high quality generative framework competitive with GANs but with more stable training.", "read", "/orig.pdf", 30 * day),
  paper("01PAP4", "Attention is all you need",
    ["A. Vaswani", "N. Shazeer", "N. Parmar"], 2017, "NeurIPS 2017", null, "1706.03762",
    "We propose the Transformer, a model architecture relying entirely on attention mechanisms.", "must", "/orig.pdf", 90 * day),
  paper("01PAP5", "Sub-nm-precision atom assembly via optical tweezers",
    ["F. Park", "Y. Yamamoto"], 2023, "Science", "10.1126/science.abc4567", null,
    "We demonstrate single-atom assembly with 0.4 Å placement variance using two-stage feedback.", "unread", null, 7 * day),
  paper("01PAP6", "Survey: post-quantum key exchange beyond Kyber",
    ["S. Bose"], 2024, "IACR ePrint", null, "2403.15511",
    "A 60-page review covering structured-lattice, isogeny-based, and code-based KEMs proposed after the NIST round-4 finalists.", "unread", "/orig.pdf", 15 * day),
];

function paper(id: string, title: string, authors: string[], year: number, venue: string, doi: string | null, arxivId: string | null, abstractText: string, status: "unread" | "reading" | "read" | "must", pdfPath: string | null, agoDays: number) {
  const t = now - agoDays * day;
  return {
    id, title, authors, year, venue, doi, arxiv_id: arxivId, abstract_text: abstractText,
    pdf_path: pdfPath, note_path: pdfPath ? pdfPath.replace(/original\.pdf$|orig\.pdf$/, "note.md") : null,
    added_at: t, updated_at: t, read_status: status,
    tldr: null, research_question: null, method: null, dataset: null, key_findings: [],
    limitations: null, comparison: null, title_translated: null, abstract_translated: null,
    translate_target_lang: null, translated_at: null,
  };
}

export const FOLDERS = [
  { id: 1, name: "超快激光", parent_id: null, paper_count: 4 },
  { id: 2, name: "机器学习", parent_id: null, paper_count: 8 },
  { id: 3, name: "Transformer 综述", parent_id: 2, paper_count: 3 },
  { id: 4, name: "元表面", parent_id: null, paper_count: 2 },
];

export const TAGS = [
  { id: 1, name: "必读", parent_id: null, color: "#fbbf24", paper_count: 2 },
  { id: 2, name: "review", parent_id: null, color: "#7dd3fc", paper_count: 1 },
  { id: 3, name: "agentic", parent_id: null, color: "#a78bfa", paper_count: 3 },
  { id: 4, name: "diffusion", parent_id: null, color: "#34d399", paper_count: 1 },
];

export const PROFILES = [
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1", api_key: "sk-•••••••••••", chat_model: "deepseek-chat", embed_model: null, max_tokens: 4096, temperature: 0.2 },
  { name: "Ollama 本地", base_url: "http://127.0.0.1:11434/v1", api_key: "ollama", chat_model: "qwen2.5:14b", embed_model: "bge-m3:latest", max_tokens: 8192, temperature: 0.3 },
];

export const TASK_ASSIGNMENTS = {
  tldr: { profile: "DeepSeek", model: "deepseek-chat" },
  quick_read: { profile: "DeepSeek", model: "deepseek-reasoner" },
  translate: { profile: "Ollama 本地", model: "qwen2.5:14b" },
  tag: null, link: null,
  topic_survey: { profile: "DeepSeek", model: "deepseek-reasoner" },
  ask: { profile: "DeepSeek", model: "deepseek-chat" },
};

export const FEEDS = [
  { id: 1, url: "http://export.arxiv.org/rss/physics.optics", title: "arXiv physics.optics", description: "arXiv submissions in optics", etag: "W/\"abc123\"", last_modified: null, last_fetched_at: now - 1800, last_error: null, created_at: now - 30 * day, total_items: 22, unread_items: 5 },
  { id: 2, url: "https://www.nature.com/nphoton.rss", title: "Nature Photonics", description: "Latest from Nature Photonics", etag: null, last_modified: null, last_fetched_at: now - 7200, last_error: null, created_at: now - 60 * day, total_items: 18, unread_items: 2 },
  { id: 3, url: "https://opg.optica.org/feed/optica.xml", title: "Optica", description: "Latest from Optica", etag: null, last_modified: null, last_fetched_at: now - 86400, last_error: null, created_at: now - 14 * day, total_items: 9, unread_items: 0 },
];

export const FEED_ITEMS = [
  feedItem("f1", 1, "Ultrafast laser writing of buried waveguides in lithium niobate via two-step annealing", ["L. Zhou", "T. K. Allison"], "We report a two-step thermal protocol that converts type-II tracks in x-cut LiNbO₃ into low-loss buried waveguides…", 1800, false),
  feedItem("f2", 1, "Self-referenced f-2f interferometer using only intra-cavity supercontinuum", ["M. Pototschnig"], "An f-2f comb stabilization scheme that needs no external HNLF.", 3600, false),
  feedItem("f3", 2, "Cavity-enhanced single-photon sources at telecom wavelengths reach 92% extraction", ["S. Wang", "R. Trotta"], null, 7200, false),
  feedItem("f4", 1, "All-optical PT-symmetric breaking in coupled microring resonators", ["A. Hayrapetyan"], "Experimental demonstration of exceptional-point sensing.", 86400, true),
  feedItem("f5", 2, "Mid-infrared frequency combs from quantum cascade lasers without external pump", null, null, 172800, true),
  feedItem("f6", 3, "Programmable polarization filtering with cascaded dielectric metasurfaces", ["K. Cui"], "We show that two cascaded metasurfaces can synthesize arbitrary 2-port Jones matrices.", 200000, true),
];

function feedItem(id: string, feedId: number, title: string, authors: string[] | null, summary: string | null, agoSec: number, seen: boolean) {
  return { id, feed_id: feedId, entry_id: `urn:${id}`, title, link: `https://example.org/${id}`, summary, authors: authors ?? [], published_at: now - agoSec, fetched_at: now - agoSec + 60, seen, imported_paper_id: null };
}
