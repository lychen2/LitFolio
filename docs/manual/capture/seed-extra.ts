// Extra seed data: arxiv drafts, topic search & survey, ask result, highlights, terms.

const now = Math.floor(Date.now() / 1000);
const day = 86400;

export const ARXIV_DRAFTS = [
  draft("Bayesian flow networks for symbolic regression", ["A. Khrabrov", "J. Lim"], 2025, "arXiv preprint", null, "2503.00891", "We extend BFNs to the discrete symbolic-regression setting and outperform GP-based baselines on the Feynman dataset."),
  draft("Memory-constrained RAG with rolling KV cache truncation", ["P. Singh"], 2025, "arXiv preprint", null, "2503.02118", "A simple but effective KV-cache eviction policy for very long retrieval contexts that halves peak memory."),
  draft("Sparse mixture-of-experts converges faster with cosine routing", ["L. Yu", "Q. Chen"], 2025, null, null, "2503.04042", "We show that L2-normalized expert embeddings (cosine routing) stabilize MoE training."),
  draft("Why dropout is essential for ReLU residual networks", ["M. Vyas"], 2025, null, null, "2503.04901", "An information-theoretic analysis of the variance amplification problem at residual junctions."),
  draft("Diffusion model alignment via direct preference optimization on noise vectors", ["H. Park", "S. Choi"], 2025, null, null, "2503.05123", "Aligning diffusion models without an explicit reward model."),
  draft("Reading order detection in scientific PDFs with a 3M-parameter transformer", ["T. Allen"], 2025, null, null, "2503.05511", "A tiny model that beats GROBID + LayoutLMv3 on ICDAR-21."),
];

function draft(title: string, authors: string[], year: number | null, venue: string | null, doi: string | null, arxivId: string | null, abstractText: string) {
  return { title, authors, year, venue, doi, arxiv_id: arxivId, abstract_text: abstractText };
}

export const TOPIC_REPORT = {
  query: "retrieval augmented generation",
  recent_year_from: 2023, recent_year_to: 2025,
  recent: makeHits([
    ["Self-RAG: learning to retrieve, generate, and critique through self-reflection", ["A. Asai"], 2024, "ICLR 2024", "2310.11511", 612, 87],
    ["RAFT: adapting language model to domain-specific RAG", ["T. Chen"], 2024, null, "2403.10131", 412, 51],
    ["Corrective RAG: a small auxiliary model corrects RAG generation", ["W. Hu"], 2024, "ACL 2024", "2401.15884", 388, 44],
    ["KG-RAG: knowledge-graph grounded retrieval-augmented generation", ["E. Wu"], 2024, null, "2403.13808", 290, 35],
    ["Long-context vs RAG: when do we still need retrieval?", ["B. Lewis"], 2024, "EMNLP 2024", "2405.06211", 275, 33],
    ["Adaptive-RAG: deciding when to retrieve dynamically", ["S. Jeong"], 2024, "NAACL 2024", "2403.14403", 245, 28],
  ]),
  classic: makeHits([
    ["Retrieval-augmented generation for knowledge-intensive NLP tasks", ["P. Lewis"], 2020, "NeurIPS 2020", "2005.11401", 5341, 803],
    ["REALM: retrieval-augmented language model pre-training", ["K. Guu"], 2020, "ICML 2020", "2002.08909", 3022, 510],
    ["Dense passage retrieval for open-domain question answering", ["V. Karpukhin"], 2020, "EMNLP 2020", "2004.04906", 4501, 720],
    ["FiD: leveraging passage retrieval with generative models", ["G. Izacard"], 2021, "EACL 2021", "2007.01282", 1822, 245],
    ["Atlas: few-shot learning with retrieval-augmented language models", ["G. Izacard"], 2022, "JMLR 2023", "2208.03299", 1612, 220],
    ["When not to trust language models: investigating effectiveness of parametric and non-parametric memories", ["A. Mallen"], 2023, "ACL 2023", "2212.10511", 740, 99],
  ]),
};

function makeHits(rows: [string, string[], number, string | null, string | null, number, number][]) {
  return rows.map(([title, authors, year, venue, arxivId, cites, infl]) => ({
    paper_id: null, citation_count: cites, influential_citation_count: infl,
    draft: { title, authors, year, venue, doi: null, arxiv_id: arxivId, abstract_text: null },
  }));
}

export const TOPIC_SURVEY = {
  topic: "极端超短脉冲激光",
  subareas: [
    sub("少周期脉冲产生", [2020, 2025], "用非线性气体填充空芯光纤或固态后压缩，把毫焦量级脉冲压到 < 4 fs。综述了三种主流多通胞 + post-compression 路径。",
      ["hollow-core fiber post-compression", "multi-pass cell self-compression", "few-cycle pulse generation"],
      [survey("hpa1", "Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression", ["F. Krausz"], 2021, "Nature Photonics", "2104.00012", 412, 53, true),
       survey("hpa2", "Multi-pass cell compression with 0.5 mJ output at 6 fs", ["A. Vernaleken"], 2022, "Optics Letters", "2202.08821", 188, 26, true),
       survey("hpa3", "Solid-state thin-plate post-compression below 5 fs", ["A. L'Huillier"], 2023, "Optics Express", "2303.04415", 121, 16, false),
       survey("hpa4", "Self-compression in a noble-gas-filled antiresonant fiber", ["P. Russell"], 2024, "Optica", "2402.01188", 88, 11, false)]),
    sub("阿秒脉冲合成与表征", [2019, 2025], "高次谐波辐射的相位锁定、Streaking 表征、自参考 attosecond comb 是该方向的支柱工作。",
      ["isolated attosecond pulse generation", "attosecond streaking reconstruction", "attosecond pulse train shaping"],
      [survey("att1", "Isolated 53-attosecond pulse from a polarization-gated HHG source", ["J. Itatani"], 2022, "Nature", "2201.10456", 522, 78, true),
       survey("att2", "Sub-cycle electron-pulse-pump probing of valence rearrangement", ["S. Hassan"], 2023, "Science", "2301.04522", 233, 31, false),
       survey("att3", "Attosecond chronoscopy with a circular-polarized streaking field", ["P. Eckle"], 2020, "Phys. Rev. X", "2007.09988", 188, 22, false),
       survey("att4", "Self-referenced attosecond comb with f-2f beat", ["E. Goulielmakis"], 2024, "Nature Photonics", "2403.15822", 71, 9, true)]),
    sub("相对论强度脉冲应用", [2020, 2025], "PW 级别峰功率开启了 wakefield 加速、相对论 HHG 与高能粒子源应用，重点综述阴极加速器和真空场结构。",
      ["petawatt laser facility", "laser wakefield acceleration", "vacuum birefringence laser"],
      [survey("rel1", "GeV electron beams from a 10-PW laser-plasma accelerator", ["W. Leemans"], 2023, "Nature Physics", "2306.10044", 405, 61, true),
       survey("rel2", "Relativistic high-harmonic generation on a solid surface at 1e22 W/cm²", ["S. Tzortzakis"], 2022, "Phys. Rev. Lett.", "2210.08812", 222, 28, false),
       survey("rel3", "Vacuum birefringence search with the ELI-Beamlines petawatt", ["K. Homma"], 2024, "Eur. Phys. J. D", "2404.00712", 41, 6, false),
       survey("rel4", "Self-injection thresholds in capillary discharge LWFA", ["X. Wang"], 2023, "Phys. Rev. Accel. Beams", "2305.00982", 88, 11, false)]),
  ],
  key_pis: [
    { name: "Ferenc Krausz", why_central: "阿秒科学开创者，2023 诺贝尔奖；HHG 与 streaking 表征长期方向引领者。" },
    { name: "Anne L'Huillier", why_central: "HHG 谐波数理论开拓者；同获 2023 诺贝尔奖。" },
    { name: "Eleftherios Goulielmakis", why_central: "亚阿秒脉冲首创实验，高次谐波频梳综合的主要推动者。" },
  ],
  must_read_ids: ["hpa1", "hpa2", "att1", "att4", "rel1"],
  annotated: true, plan_model: "deepseek-reasoner", plan_tokens: 1820,
  annotate_model: "deepseek-chat", annotate_tokens: 4310,
};

function sub(name: string, range: [number, number], summary: string, terms: string[], papers: any[]) {
  return { name, year_range: range, summary, search_terms: terms, papers };
}
function survey(id: string, title: string, authors: string[], year: number | null, venue: string | null, arxivId: string | null, citations: number, infl: number, mustRead: boolean) {
  return { id, title, authors, year, venue, doi: null, arxiv_id: arxivId, abstract_text: null, citation_count: citations, influential_citation_count: infl, why_important: mustRead ? "在所选时间窗内引用最高且方法对后续工作有直接影响。" : null, must_read: mustRead };
}

export const ASK_RESULT = {
  question: "这些论文里讨论 chirped pulse amplification 局限的工作有哪几篇？",
  answer: "目前库内三篇直接讨论 CPA 局限性的论文：[1] Krausz 2021 重点指出空芯光纤后压缩可以绕开传统 CPA 的 B-积分上限，但热透镜效应限制了平均功率向上扩展。[2] Vernaleken 2022 在多通胞方案中给出更具体的能量-脉宽 trade-off 曲线，表明 CPA 之后必须有 post-compression 才能进入少周期区域。[3] L'Huillier 2023 综述了固态薄板的自相位调制，作为 CPA 链路下游的可替代后压缩方案。\n\n这些工作共同的指向是：CPA 把脉宽稳定下来后，仍需额外非线性压缩段才能突破 sub-10-fs 区间；继续提升峰功率受热管理、光谱整形和载波包络相位锁定三重限制。",
  sources: [
    { paper_id: "hpa1", title: "Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression", year: 2021, authors: ["F. Krausz"], snippet: "We push CPA-amplified mJ-class pulses through gas-filled hollow-core fibers and demonstrate sub-4-fs compression with hot-spot management as the remaining bottleneck." },
    { paper_id: "hpa2", title: "Multi-pass cell compression with 0.5 mJ output at 6 fs", year: 2022, authors: ["A. Vernaleken"], snippet: "Direct CPA at sub-10-fs is currently infeasible; our results illustrate the energy-duration trade-off that motivates post-compression stages." },
    { paper_id: "hpa3", title: "Solid-state thin-plate post-compression below 5 fs", year: 2023, authors: ["A. L'Huillier"], snippet: "We treat thin solid plates as an attractive alternative to gas-filled fibers when peak power exceeds the SPM-induced damage threshold of gas." },
  ],
  model: "deepseek-chat", prompt_tokens: 2880, completion_tokens: 540,
  terms: ["chirped pulse amplification limitations", "post-compression hollow core fiber", "thin plate self-phase modulation"], retrieved_count: 3,
};

// react-pdf-highlighter requires position.pageNumber non-null; otherwise
// groupHighlightsByPage crashes on selection. Use scaled coords (0~1 of page).
function scaledRect(pageNumber: number, y1: number, y2: number) {
  const boundingRect = { x1: 80, y1: y1 * 800, x2: 540, y2: y2 * 800, width: 620, height: 800, pageNumber };
  return { boundingRect, rects: [boundingRect], pageNumber, usePdfCoordinates: false };
}

export const HIGHLIGHTS = [
  { id: "h1", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 2, rect: scaledRect(2, 0.18, 0.22), color: "#fbbf24", label: "关键发现", text: "We replace the human-in-the-loop with a self-correcting agentic frame…", note: "回头补到第 3 章的相关工作里。", summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - day },
  { id: "h2", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 4, rect: scaledRect(4, 0.42, 0.46), color: "#a78bfa", label: "方法", text: "Failure recovery loops reduce average attempts by 41% (Table 2).", note: null, summary_text: "提到 failure recovery 可以在 ablation 里复用这个比例数据。", summary_model: "deepseek-chat", summarized_at: now - 3600, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - 3600 * 5 },
  { id: "h3", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 6, rect: scaledRect(6, 0.65, 0.69), color: "#7dd3fc", label: "待验证", text: "FDTD evaluation latency dominates the iteration budget.", note: null, summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - 3600 * 2 },
  { id: "h4", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 3, rect: scaledRect(3, 0.30, 0.34), color: "#f87171", label: "不同意", text: "The baseline topology optimization converges faster on single-objective targets.", note: "这个结论和他们 Table 3 的数据矛盾，需要复现验证。", summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - 3600 * 8 },
];

export const TERMS = [
  term(101, "01KSCN65XF4B2PZ83D27ET55PX", "agentic loop", "agent 自主跑「设计→评估→修正」多轮的闭环；区别于人类专家迭代驱动的循环。", "see §3.2 agentic loop", 0.92),
  term(102, "01KSCN65XF4B2PZ83D27ET55PX", "failure recovery", "在评估失败时回滚到上一个稳定的设计，并用错误信息作为下一轮的提示。", "Figure 3 failure recovery breakdown", 0.88),
  term(103, "01KSCN65XF4B2PZ83D27ET55PX", "FDTD evaluator", "用 finite-difference time-domain 模拟做正向求解，作为 agent 决策的反馈环。", "evaluator latency in Table 1", 0.83),
  term(104, "01KSCN65XF4B2PZ83D27ET55PX", "self-consistency budget", "对同一目标采样 N 次并取多数表决，提高 agent 输出的稳定性。", "self-consistency in §4.1", 0.71),
];

// ─── Knowledge Graph seed data ─────────────────────────────────────────

export const GRAPH_DATA = {
  nodes: [
    // Paper nodes
    { id: "01KSCN65XF4B2PZ83D27ET55PX", node_type: "paper", label: "Agentic metasurface design with self-correcting language-model loops", sublabel: "2025", year: 2025, read_status: "reading", paper_count: undefined },
    { id: "01PAP2", node_type: "paper", label: "Cross-attention is overrated for long-document QA", sublabel: "2024", year: 2024, read_status: "must", paper_count: undefined },
    { id: "01PAP3", node_type: "paper", label: "Denoising diffusion probabilistic models", sublabel: "2020", year: 2020, read_status: "read", paper_count: undefined },
    { id: "01PAP4", node_type: "paper", label: "Attention is all you need", sublabel: "2017", year: 2017, read_status: "must", paper_count: undefined },
    { id: "01PAP5", node_type: "paper", label: "Sub-nm-precision atom assembly via optical tweezers", sublabel: "2023", year: 2023, read_status: "unread", paper_count: undefined },
    { id: "01PAP6", node_type: "paper", label: "Survey: post-quantum key exchange beyond Kyber", sublabel: "2024", year: 2024, read_status: "unread", paper_count: undefined },
    // Concept nodes
    { id: "concept:attention mechanism", node_type: "concept", label: "attention mechanism", sublabel: "用于序列建模的注意力计算机制", year: undefined, read_status: undefined, paper_count: 3 },
    { id: "concept:language model", node_type: "concept", label: "language model", sublabel: "基于概率的文本生成模型", year: undefined, read_status: undefined, paper_count: 3 },
    { id: "concept:metasurface", node_type: "concept", label: "metasurface", sublabel: "亚波长结构单元组成的光学超薄表面", year: undefined, read_status: undefined, paper_count: 2 },
    { id: "concept:generative model", node_type: "concept", label: "generative model", sublabel: "学习数据分布并生成新样本的模型", year: undefined, read_status: undefined, paper_count: 2 },
  ],
  edges: [
    // Paper-to-paper links (user-created)
    { id: "link:1", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP4", edge_type: "builds_on", source_type: "user", confidence: 1.0, snippet: "Agentic framework uses Transformer as backbone for LLM-driven design loop." },
    { id: "link:2", source: "01PAP2", target: "01PAP4", edge_type: "extends", source_type: "user", confidence: 1.0, snippet: "Proposes replacing cross-attention with gating, a direct extension of the Transformer attention mechanism." },
    { id: "link:3", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP2", edge_type: "uses_method", source_type: "user", confidence: 1.0, snippet: "Agent uses long-context QA backbone for FDTD result parsing." },
    { id: "link:4", source: "01PAP3", target: "01PAP4", edge_type: "builds_on", source_type: "user", confidence: 1.0, snippet: "Diffusion models adopt Transformer-based denoising networks." },
    // Paper-to-paper links (AI-discovered)
    { id: "link:5", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP3", edge_type: "related", source_type: "ai", confidence: 0.65, snippet: "Both use iterative refinement loops—agentic design and diffusion denoising share a multi-round correction paradigm." },
    { id: "link:6", source: "01PAP2", target: "01PAP3", edge_type: "compares", source_type: "ai", confidence: 0.55, snippet: "Both challenge established architectures: one questions cross-attention, the other GANs." },
    // Paper-to-concept edges (derived)
    { id: "term:01KSCN65XF4B2PZ83D27ET55PX:attention mechanism", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "concept:attention mechanism", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP2:attention mechanism", source: "01PAP2", target: "concept:attention mechanism", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP4:attention mechanism", source: "01PAP4", target: "concept:attention mechanism", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01KSCN65XF4B2PZ83D27ET55PX:language model", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "concept:language model", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP2:language model", source: "01PAP2", target: "concept:language model", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP4:language model", source: "01PAP4", target: "concept:language model", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01KSCN65XF4B2PZ83D27ET55PX:metasurface", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "concept:metasurface", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP5:metasurface", source: "01PAP5", target: "concept:metasurface", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP3:generative model", source: "01PAP3", target: "concept:generative model", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
    { id: "term:01PAP4:generative model", source: "01PAP4", target: "concept:generative model", edge_type: "has_concept", source_type: "derived", confidence: 1.0, snippet: null },
  ],
};

export const GRAPH_LINKS = [
  { id: 1, source_paper_id: "01KSCN65XF4B2PZ83D27ET55PX", target_paper_id: "01PAP4", relation: "builds_on", source_type: "user", confidence: 1.0, snippet: "Agentic framework uses Transformer as backbone for LLM-driven design loop.", created_at: now - 2 * day, updated_at: now - 2 * day },
  { id: 2, source_paper_id: "01PAP2", target_paper_id: "01PAP4", relation: "extends", source_type: "user", confidence: 1.0, snippet: "Proposes replacing cross-attention with gating, a direct extension of the Transformer attention mechanism.", created_at: now - 3 * day, updated_at: now - 3 * day },
  { id: 3, source_paper_id: "01KSCN65XF4B2PZ83D27ET55PX", target_paper_id: "01PAP2", relation: "uses_method", source_type: "user", confidence: 1.0, snippet: "Agent uses long-context QA backbone for FDTD result parsing.", created_at: now - day, updated_at: now - day },
  { id: 4, source_paper_id: "01PAP3", target_paper_id: "01PAP4", relation: "builds_on", source_type: "user", confidence: 1.0, snippet: "Diffusion models adopt Transformer-based denoising networks.", created_at: now - 5 * day, updated_at: now - 5 * day },
  { id: 5, source_paper_id: "01KSCN65XF4B2PZ83D27ET55PX", target_paper_id: "01PAP3", relation: "related", source_type: "ai", confidence: 0.65, snippet: "Both use iterative refinement loops—agentic design and diffusion denoising share a multi-round correction paradigm.", created_at: now - day, updated_at: now - day },
  { id: 6, source_paper_id: "01PAP2", target_paper_id: "01PAP3", relation: "compares", source_type: "ai", confidence: 0.55, snippet: "Both challenge established architectures: one questions cross-attention, the other GANs.", created_at: now - day, updated_at: now - day },
];

function term(id: number, paperId: string, t: string, def: string, evidence: string, score: number) {
  return {
    term: { id, paper_id: paperId, term: t, normalized_term: t.toLowerCase(), local_definition: def, local_evidence: evidence, score, created_at: now - day, updated_at: now - 3600 },
    related: [
      { paper_id: "01PAP4", paper_title: "Attention is all you need", paper_year: 2017, term: t, local_definition: "在自然语言任务里这个术语对应的是注意力机制的多头结构。" },
    ],
  };
}

// ─── Concepts seed data ─────────────────────────────────────────────────

export const CONCEPTS = [
  { id: 1, name: "attention mechanism", description: "用于序列建模的注意力计算机制，通过 query-key-value 矩阵实现上下文感知的特征聚合。", source: "ai", created_at: now - 10 * day },
  { id: 2, name: "language model", description: "基于概率的文本生成模型，通过自回归或掩码预测学习语言分布。", source: "ai", created_at: now - 10 * day },
  { id: 3, name: "metasurface", description: "亚波长结构单元组成的光学超薄表面，可对入射光的振幅、相位和偏振进行亚波长尺度调控。", source: "ai", created_at: now - 8 * day },
  { id: 4, name: "generative model", description: "学习数据分布并生成新样本的模型，包括 GAN、VAE 和扩散模型等范式。", source: "user", created_at: now - 6 * day },
];

export const CONCEPT_RELATIONS = [
  { id: 1, source_concept_id: 1, target_concept_id: 2, relation: "enables", evidence_paper_id: "01PAP4", snippet: "Attention mechanism is the core building block of modern language models.", created_at: now - 9 * day },
  { id: 2, source_concept_id: 4, target_concept_id: 2, relation: "extends_concept", evidence_paper_id: "01PAP3", snippet: "Generative models extend language modeling to continuous data domains.", created_at: now - 7 * day },
  { id: 3, source_concept_id: 3, target_concept_id: 1, relation: "requires", evidence_paper_id: "01KSCN65XF4B2PZ83D27ET55PX", snippet: "Metasurface inverse design uses attention-based LLM agents.", created_at: now - 5 * day },
];

export const PAPER_CONCEPTS = [
  { paper_id: "01KSCN65XF4B2PZ83D27ET55PX", concept_id: 1, concept_name: "attention mechanism", relevance: 0.9 },
  { paper_id: "01KSCN65XF4B2PZ83D27ET55PX", concept_id: 2, concept_name: "language model", relevance: 0.95 },
  { paper_id: "01KSCN65XF4B2PZ83D27ET55PX", concept_id: 3, concept_name: "metasurface", relevance: 1.0 },
  { paper_id: "01PAP4", concept_id: 1, concept_name: "attention mechanism", relevance: 1.0 },
  { paper_id: "01PAP4", concept_id: 2, concept_name: "language model", relevance: 0.85 },
  { paper_id: "01PAP3", concept_id: 4, concept_name: "generative model", relevance: 1.0 },
];

// ─── Comparison seed data ───────────────────────────────────────────────

export const COMPARISONS = [
  {
    id: 1,
    paper_ids: ["01KSCN65XF4B2PZ83D27ET55PX", "01PAP2", "01PAP4"],
    content: `## 多论文对比分析

| 维度 | Agentic metasurface design | Cross-attention is overrated | Attention is all you need |
|------|---------------------------|------------------------------|--------------------------|
| **问题** | 元表面逆向设计依赖人类专家迭代 | 长文档 QA 中 cross-attention 计算开销大 | 序列建模依赖 RNN/CNN，无法并行 |
| **方法** | LLM agent 闭环 + FDTD 评估 | 可学习门控层替代 cross-attention | Transformer 自注意力架构 |
| **核心指标** | 8.3 轮收敛到专家基线 | 6/8 基准无显著精度损失，省 23% FLOPs | WMT 翻译 BLEU 刷新纪录 |
| **局限** | FDTD 仿真 ~3 min/iter 是瓶颈 | 2/8 基准有统计显著下降 | 对超长序列 O(n²) 复杂度 |
| **关系** | 使用 Transformer 做 agent 推理骨干 | 替代了原始 Transformer 的 cross-attention | 奠基工作，后续工作的共同基础 |

### 关键洞察
三篇论文展示了 Transformer 架构从提出到应用再到优化的演化路径：Attention is all you need 奠定了基础，Cross-attention is overrated 对其进行了精简优化，Agentic metasurface design 则将其应用到物理设计领域。`,
    model: "deepseek-chat",
    created_at: now - 2 * day,
    updated_at: now - 2 * day,
  },
];

// ─── Smart Collections seed data ────────────────────────────────────────

export const SMART_COLLECTIONS = [
  {
    id: 1,
    name: "2024+ 必读论文",
    rules: { type: "group", combinator: "and", rules: [
      { type: "condition", field: "year", operator: "gte", value: 2024 },
      { type: "condition", field: "read_status", operator: "equals", value: "must" },
    ]},
    created_at: now - 5 * day,
    updated_at: now - 3 * day,
  },
  {
    id: 2,
    name: "Transformer 相关",
    rules: { type: "group", combinator: "or", rules: [
      { type: "condition", field: "title", operator: "contains", value: "attention" },
      { type: "condition", field: "title", operator: "contains", value: "Transformer" },
      { type: "condition", field: "tags", operator: "contains", value: "agentic" },
    ]},
    created_at: now - 4 * day,
    updated_at: now - 2 * day,
  },
];

// ─── Reading Queue seed data ────────────────────────────────────────────

const hour = 3600;

export const READING_QUEUE = [
  { paper_id: "01PAP2", priority: 2, target_date: now + 3 * day, note: "EMNLP 2024 口碑不错，重点关注 gating 替代方案", added_at: now - 2 * day, title: "Cross-attention is overrated for long-document QA", authors: "A. Chen, R. Müller", year: 2024 },
  { paper_id: "01PAP6", priority: 1, target_date: now + 7 * day, note: "PQ 综述，对比 Kyber 与其他方案", added_at: now - day, title: "Survey: post-quantum key exchange beyond Kyber", authors: "S. Bose", year: 2024 },
  { paper_id: "01PAP4", priority: 3, target_date: null, note: "经典必读，写 related work 时引用", added_at: now - 3 * day, title: "Attention is all you need", authors: "A. Vaswani, N. Shazeer, N. Parmar", year: 2017 },
  { paper_id: "01PAP5", priority: 0, target_date: now + 14 * day, note: null, added_at: now - 6 * hour, title: "Sub-nm-precision atom assembly via optical tweezers", authors: "F. Park, Y. Yamamoto", year: 2023 },
];

// ─── Custom Field Definitions seed data ─────────────────────────────────

export const CUSTOM_FIELD_DEFS = [
  { id: 1, name: "实验复现状态", field_type: "select", options: ["未复现", "复现中", "已复现", "复现失败"], created_at: now - 10 * day },
  { id: 2, name: "代码仓库", field_type: "text", options: null, created_at: now - 8 * day },
  { id: 3, name: "评分", field_type: "number", options: null, created_at: now - 6 * day },
];

export const PAPER_CUSTOM_FIELDS = [
  { field_id: 1, field_name: "实验复现状态", field_type: "select", options: ["未复现", "复现中", "已复现", "复现失败"], value: "复现中" },
  { field_id: 2, field_name: "代码仓库", field_type: "text", options: null, value: "https://github.com/example/agentic-metasurface" },
  { field_id: 3, field_name: "评分", field_type: "number", options: null, value: "8" },
];

// ─── Topic Alerts seed data ─────────────────────────────────────────────

export const TOPIC_ALERTS = [
  { id: 1, query: "agentic metasurface design", frequency: "weekly", target_folder_id: 4, auto_import: false, last_run_at: now - 86400, created_at: now - 14 * day },
  { id: 2, query: "few-cycle ultrashort pulse generation", frequency: "daily", target_folder_id: 1, auto_import: true, last_run_at: now - 3600, created_at: now - 7 * day },
];

export const TOPIC_ALERT_RESULTS = [
  { id: 1, alert_id: 1, paper_doi: null, paper_arxiv_id: "2505.01234", title: "Agentic inverse design of photonic crystals with self-verifying FDTD loops", authors: "K. Tanaka, J. Park", year: 2025, abstract_text: "We extend the agentic design paradigm to 3D photonic crystals, achieving 92% bandgap accuracy in 12 iterations.", seen: false, added_at: now - 3600 },
  { id: 2, alert_id: 1, paper_doi: "10.1038/s41566-025-01789", paper_arxiv_id: null, title: "LLM-guided topology optimization for nanophotonics: a benchmark study", authors: "M. Hassan", year: 2025, abstract_text: "A systematic comparison of three LLM-based frameworks for nanophotonic topology optimization.", seen: false, added_at: now - 1800 },
  { id: 3, alert_id: 2, paper_doi: null, paper_arxiv_id: "2505.02345", title: "Sub-2-fs pulse generation via cascaded hollow-core compression", authors: "L. Zhou", year: 2025, abstract_text: "We demonstrate cascaded hollow-core fiber compression achieving 1.8-fs pulses at 0.3 mJ.", seen: true, added_at: now - 7200 },
];

// ─── Similar Papers seed data ───────────────────────────────────────────

export const SIMILAR_PAPERS = [
  { paper_id: "sim1", title: "Agentic design of photonic devices using reinforcement learning", authors: ["W. Zhang", "H. Li"], year: 2025, venue: "Nature Communications", abstract_snippet: "We combine RL with FDTD evaluation for inverse photonic design, achieving human-competitive results on 5 benchmark structures.", doi: "10.1038/s41467-025-12345", arxiv_id: "2502.08765", citation_count: 28 },
  { paper_id: "sim2", title: "Self-correcting language agents for scientific discovery", authors: ["A. Asai", "Y. Watanabe"], year: 2025, venue: "ICLR 2025", abstract_snippet: "We present a framework where LLM agents autonomously formulate hypotheses, design experiments, and iterate based on results.", doi: null, arxiv_id: "2410.15432", citation_count: 45 },
  { paper_id: "sim3", title: "Inverse design of metasurfaces with diffusion models", authors: ["P. Chen", "S. Wang"], year: 2024, venue: "Optica", abstract_snippet: "Conditional diffusion models generate metasurface geometries from target spectra in a single forward pass.", doi: "10.1364/OPTICA.500001", arxiv_id: "2405.09876", citation_count: 67 },
  { paper_id: "sim4", title: "Transformer-based surrogate models for electromagnetic simulation", authors: ["R. Müller", "K. Tanaka"], year: 2024, venue: "ACS Photonics", abstract_snippet: "A Transformer surrogate replaces FDTD with 1000x speedup at <1% error for periodic metasurface cells.", doi: "10.1021/acsphotonics.4c01234", arxiv_id: null, citation_count: 34 },
];

// ─── Literature Review seed data ────────────────────────────────────────

export const LIT_REVIEW = {
  markdown: `# 文献综述: 元表面智能设计与注意力机制

## 1. 引言

近年来，大语言模型（LLM）在科学计算领域的应用引起了广泛关注。本综述聚焦于 Transformer 注意力机制在元表面逆向设计中的应用，涵盖了从基础架构到实际应用的三个关键维度。

## 2. 注意力机制的基础架构

### 2.1 Transformer 的核心贡献

Vaswani 等人 [3] 提出的 Transformer 架构彻底改变了序列建模范式。其核心创新在于完全依赖自注意力机制替代传统的循环和卷积结构，实现了高度并行化的训练。

### 2.2 架构优化方向

Chen 和 Müller [2] 对 Transformer 中的交叉注意力层提出了质疑。他们发现，在长文档问答任务中，用可学习的门控层替代交叉注意力，可以在 6/8 个基准上保持统计无显著差异的精度，同时节省 23% 的计算开销。

## 3. 智能体驱动的元表面设计

### 3.1 闭环设计框架

Liu 等人 [1] 提出了一种创新的闭环 agentic 框架，将 LLM 作为设计决策的核心。该系统通过「设计 → FDTD 评估 → 自我反思 → 修正」的多轮迭代，在平均 8.3 轮内达到人类专家水平。

### 3.2 失败恢复机制

值得注意的是，该框架引入的失败恢复循环将平均尝试次数降低了 41%，这一机制对于提高自动化设计的可靠性具有重要意义。

## 4. 关键发现与研究趋势

| 研究方向 | 关键指标 | 发展趋势 |
|---------|---------|---------|
| 注意力架构 | 23% FLOPs 节省 | 架构精简 |
| 智能体设计 | 8.3 轮收敛 | 自动化程度提升 |
| 元表面应用 | 3 个基准目标 | 应用范围扩大 |

## 5. 结论

三篇论文展示了从基础架构创新到领域应用的完整链路。未来研究可关注 FDTD 仿真加速（当前 ~3 min/iter 是主要瓶颈）以及将 agentic 框架推广到更多物理设计场景。

---

**参考文献**

[1] Liu, Z. et al. "Agentic metasurface design with self-correcting language-model loops." Nature Photonics (2025).
[2] Chen, A. & Müller, R. "Cross-attention is overrated for long-document QA." EMNLP (2024).
[3] Vaswani, A. et al. "Attention is all you need." NeurIPS (2017).
`,
  grouping: "theme",
  paper_count: 3,
  model: "deepseek-chat",
  prompt_tokens: 3200,
  completion_tokens: 1850,
};

// ─── Citation Network seed data ─────────────────────────────────────────

export const CITATION_NETWORK = {
  paper_id: "01KSCN65XF4B2PZ83D27ET55PX",
  references: [
    { paper_id: "ref1", title: "Attention is all you need", authors: ["A. Vaswani", "N. Shazeer", "N. Parmar"], year: 2017, venue: "NeurIPS 2017", abstract_snippet: "We propose the Transformer, a model architecture relying entirely on attention mechanisms.", doi: null, arxiv_id: "1706.03762" },
    { paper_id: "ref2", title: "Denoising diffusion probabilistic models", authors: ["J. Ho", "A. Jain", "P. Abbeel"], year: 2020, venue: "NeurIPS 2020", abstract_snippet: "We present diffusion models as a high quality generative framework.", doi: null, arxiv_id: "2006.11239" },
    { paper_id: "ref3", title: "Retrieval-augmented generation for knowledge-intensive NLP tasks", authors: ["P. Lewis"], year: 2020, venue: "NeurIPS 2020", abstract_snippet: "We explore a general-purpose fine-tuning recipe for retrieval-augmented generation.", doi: null, arxiv_id: "2005.11401" },
  ],
  citations: [
    { paper_id: "cit1", title: "Agentic design of photonic devices using reinforcement learning", authors: ["W. Zhang", "H. Li"], year: 2025, venue: "Nature Communications", abstract_snippet: "We combine RL with FDTD evaluation for inverse photonic design.", doi: "10.1038/s41467-025-12345", arxiv_id: "2502.08765" },
    { paper_id: "cit2", title: "Self-correcting language agents for scientific discovery", authors: ["A. Asai", "Y. Watanabe"], year: 2025, venue: "ICLR 2025", abstract_snippet: "LLM agents autonomously formulate hypotheses and iterate based on results.", doi: null, arxiv_id: "2410.15432" },
    { paper_id: "cit3", title: "Inverse design of metasurfaces with diffusion models", authors: ["P. Chen", "S. Wang"], year: 2024, venue: "Optica", abstract_snippet: "Conditional diffusion models generate metasurface geometries from target spectra.", doi: "10.1364/OPTICA.500001", arxiv_id: "2405.09876" },
  ],
};

// ─── Note Sections seed data ────────────────────────────────────────────

export const NOTE_SECTIONS = [
  { id: 1, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "overview", content: "## 速读\n\n这篇文章主要贡献是把元表面 inverse design 包到 LLM agent 里。Agent 维护设计上下文，依次输出参数 JSON、调 FDTD 评估、解析谱线、自我反思，循环 8.3 次达到人类专家水平。", source: "ai", sort_order: 0, created_at: now - 2 * day, updated_at: now - day },
  { id: 2, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "key_numbers", content: "## 重要数字\n\n- 8.3 轮平均收敛到专家基线\n- failure recovery 让尝试次数 -41%\n- FDTD 单步耗时 3 min 仍是瓶颈\n- 推理预算和最终质量成对数关系", source: "ai", sort_order: 1, created_at: now - 2 * day, updated_at: now - day },
  { id: 3, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "method_notes", content: "## 方法笔记\n\nAgent 的核心循环：\n1. 读取当前设计上下文\n2. 输出 JSON 格式的单元参数\n3. 调用 FDTD 仿真评估\n4. 解析返回的频谱\n5. 自我反思并修正\n\n失败回滚机制：当评估结果不达标时，回滚到上一个稳定设计。", source: "user", sort_order: 2, created_at: now - 2 * day, updated_at: now - 3600 },
  { id: 4, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "todo", content: "## 待跟进\n\n- [ ] 验证在介观尺度结构上的表现\n- [ ] 比较 agentic 框架与传统 topology optimization 的成本\n- [ ] 复现 Table 2 的 failure recovery 数据\n- [ ] 联系作者获取 evaluator harness 代码", source: "user", sort_order: 3, created_at: now - 2 * day, updated_at: now - 3600 },
];

// ─── Ask Conversation History seed data ─────────────────────────────────

export const ASK_CONVERSATION = [
  { role: "user", content: "这些论文里讨论 chirped pulse amplification 局限的工作有哪几篇？" },
  { role: "assistant", content: ASK_RESULT.answer },
  { role: "user", content: "那 post-compression 方案里，哪种最有潜力突破 sub-4-fs？" },
  { role: "assistant", content: "根据库内文献，最有潜力突破 sub-4-fs 的 post-compression 方案是空芯光纤后压缩（hollow-core fiber post-compression）[1]。Krausz 2021 的实验已经展示了 sub-4-fs 的结果，其核心优势在于：\n\n1. **非线性可控**：通过调节光纤长度和气体压力，可以精确控制 SPM 积累量。\n2. **能量可扩展**：相比固态薄板方案 [3]，空芯光纤对光束质量的容忍度更高。\n3. **载波包络相位保持**：空芯光纤的弱色散特性有利于保持 CEP 稳定性。\n\n但需要注意两个瓶颈：热透镜效应限制了平均功率扩展，以及光纤损伤阈值设定了峰值功率上限。Vernaleken 2022 [2] 的多通胞方案在能量方面更有优势（0.5 mJ @ 6 fs），但进入 sub-4-fs 区间仍需额外的 post-compression 级联。\n\n[1] Krausz 2021, Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression\n[2] Vernaleken 2022, Multi-pass cell compression with 0.5 mJ output at 6 fs\n[3] L'Huillier 2023, Solid-state thin-plate post-compression below 5 fs" },
];
