// English seed data for screenshot capture.

const now = Math.floor(Date.now() / 1000);
const day = 86400;
const hour = 3600;

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
  topic: "Ultrashort Intense Laser Pulses",
  subareas: [
    sub("Few-cycle pulse generation", [2020, 2025], "Compressing millijoule-level pulses to < 4 fs using nonlinear gas-filled hollow-core fibers or solid-state post-compression. Surveys three mainstream multi-pass cell + post-compression pathways.",
      ["hollow-core fiber post-compression", "multi-pass cell self-compression", "few-cycle pulse generation"],
      [survey("hpa1", "Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression", ["F. Krausz"], 2021, "Nature Photonics", "2104.00012", 412, 53, true),
       survey("hpa2", "Multi-pass cell compression with 0.5 mJ output at 6 fs", ["A. Vernaleken"], 2022, "Optics Letters", "2202.08821", 188, 26, true),
       survey("hpa3", "Solid-state thin-plate post-compression below 5 fs", ["A. L'Huillier"], 2023, "Optics Express", "2303.04415", 121, 16, false),
       survey("hpa4", "Self-compression in a noble-gas-filled antiresonant fiber", ["P. Russell"], 2024, "Optica", "2402.01188", 88, 11, false)]),
    sub("Attosecond pulse synthesis and characterization", [2019, 2025], "Phase-locking of high-harmonic radiation, streaking characterization, and self-referenced attosecond combs are the pillars of this direction.",
      ["isolated attosecond pulse generation", "attosecond streaking reconstruction", "attosecond pulse train shaping"],
      [survey("att1", "Isolated 53-attosecond pulse from a polarization-gated HHG source", ["J. Itatani"], 2022, "Nature", "2201.10456", 522, 78, true),
       survey("att2", "Sub-cycle electron-pulse-pump probing of valence rearrangement", ["S. Hassan"], 2023, "Science", "2301.04522", 233, 31, false),
       survey("att3", "Attosecond chronoscopy with a circular-polarized streaking field", ["P. Eckle"], 2020, "Phys. Rev. X", "2007.09988", 188, 22, false),
       survey("att4", "Self-referenced attosecond comb with f-2f beat", ["E. Goulielmakis"], 2024, "Nature Photonics", "2403.15822", 71, 9, true)]),
    sub("Relativistic-intensity pulse applications", [2020, 2025], "Petawatt-level peak power enables wakefield acceleration, relativistic HHG, and high-energy particle sources. Reviews cathode accelerators and vacuum field structures.",
      ["petawatt laser facility", "laser wakefield acceleration", "vacuum birefringence laser"],
      [survey("rel1", "GeV electron beams from a 10-PW laser-plasma accelerator", ["W. Leemans"], 2023, "Nature Physics", "2306.10044", 405, 61, true),
       survey("rel2", "Relativistic high-harmonic generation on a solid surface at 1e22 W/cm²", ["S. Tzortzakis"], 2022, "Phys. Rev. Lett.", "2210.08812", 222, 28, false),
       survey("rel3", "Vacuum birefringence search with the ELI-Beamlines petawatt", ["K. Homma"], 2024, "Eur. Phys. J. D", "2404.00712", 41, 6, false),
       survey("rel4", "Self-injection thresholds in capillary discharge LWFA", ["X. Wang"], 2023, "Phys. Rev. Accel. Beams", "2305.00982", 88, 11, false)]),
  ],
  key_pis: [
    { name: "Ferenc Krausz", why_central: "Pioneer of attosecond science; Nobel laureate 2023. Long-term leader in HHG and streaking characterization." },
    { name: "Anne L'Huillier", why_central: "Pioneer of HHG harmonic number theory; co-recipient of the 2023 Nobel Prize." },
    { name: "Eleftherios Goulielmakis", why_central: "First sub-attosecond pulse experiment; key driver of high-harmonic frequency comb synthesis." },
  ],
  must_read_ids: ["hpa1", "hpa2", "att1", "att4", "rel1"],
  annotated: true, plan_model: "deepseek-reasoner", plan_tokens: 1820,
  annotate_model: "deepseek-chat", annotate_tokens: 4310,
};

function sub(name: string, range: [number, number], summary: string, terms: string[], papers: any[]) {
  return { name, year_range: range, summary, search_terms: terms, papers };
}
function survey(id: string, title: string, authors: string[], year: number | null, venue: string | null, arxivId: string | null, citations: number, infl: number, mustRead: boolean) {
  return { id, title, authors, year, venue, doi: null, arxiv_id: arxivId, abstract_text: null, citation_count: citations, influential_citation_count: infl, why_important: mustRead ? "Highest citations within the selected time window with direct methodological impact on subsequent work." : null, must_read: mustRead };
}

export const ASK_RESULT = {
  question: "Which papers discuss limitations of chirped pulse amplification?",
  answer: "Three papers in the library directly discuss CPA limitations: [1] Krausz 2021 highlights that hollow-core fiber post-compression can bypass the B-integral limit of traditional CPA, but thermal lensing restricts average power scaling. [2] Vernaleken 2022 provides a more specific energy-duration trade-off curve in the multi-pass cell approach, showing that post-compression is essential after CPA to reach the few-cycle regime. [3] L'Huillier 2023 reviews self-phase modulation in solid-state thin plates as an alternative post-compression stage downstream of the CPA chain.\n\nThe common thread across these works: CPA stabilizes pulse duration, but additional nonlinear compression stages are needed to break the sub-10-fs barrier. Further peak power scaling is limited by thermal management, spectral shaping, and carrier-envelope phase locking.",
  sources: [
    { paper_id: "hpa1", title: "Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression", year: 2021, authors: ["F. Krausz"], snippet: "We push CPA-amplified mJ-class pulses through gas-filled hollow-core fibers and demonstrate sub-4-fs compression with hot-spot management as the remaining bottleneck." },
    { paper_id: "hpa2", title: "Multi-pass cell compression with 0.5 mJ output at 6 fs", year: 2022, authors: ["A. Vernaleken"], snippet: "Direct CPA at sub-10-fs is currently infeasible; our results illustrate the energy-duration trade-off that motivates post-compression stages." },
    { paper_id: "hpa3", title: "Solid-state thin-plate post-compression below 5 fs", year: 2023, authors: ["A. L'Huillier"], snippet: "We treat thin solid plates as an attractive alternative to gas-filled fibers when peak power exceeds the SPM-induced damage threshold of gas." },
  ],
  model: "deepseek-chat", prompt_tokens: 2880, completion_tokens: 540,
  terms: ["chirped pulse amplification limitations", "post-compression hollow core fiber", "thin plate self-phase modulation"], retrieved_count: 3,
};

function scaledRect(pageNumber: number, y1: number, y2: number) {
  const boundingRect = { x1: 80, y1: y1 * 800, x2: 540, y2: y2 * 800, width: 620, height: 800, pageNumber };
  return { boundingRect, rects: [boundingRect], pageNumber, usePdfCoordinates: false };
}

export const HIGHLIGHTS = [
  { id: "h1", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 2, rect: scaledRect(2, 0.18, 0.22), color: "#fbbf24", text: "We replace the human-in-the-loop with a self-correcting agentic frame…", note: "Add to Chapter 3 related work section later.", summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - day },
  { id: "h2", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 4, rect: scaledRect(4, 0.42, 0.46), color: "#a78bfa", text: "Failure recovery loops reduce average attempts by 41% (Table 2).", note: null, summary_text: "Can reuse this ratio data in the ablation study for failure recovery.", summary_model: "deepseek-chat", summarized_at: now - 3600, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - 3600 * 5 },
  { id: "h3", paper_id: "01KSCN65XF4B2PZ83D27ET55PX", page: 6, rect: scaledRect(6, 0.65, 0.69), color: "#7dd3fc", text: "FDTD evaluation latency dominates the iteration budget.", note: null, summary_text: null, summary_model: null, summarized_at: null, translation_text: null, translation_target_lang: null, translation_model: null, translated_at: null, created_at: now - 3600 * 2 },
];

export const TERMS = [
  term(101, "01KSCN65XF4B2PZ83D27ET55PX", "agentic loop", "A closed loop where an agent autonomously runs 'design → evaluate → correct' for multiple rounds; distinct from human-expert-driven iteration cycles.", "see §3.2 agentic loop", 0.92),
  term(102, "01KSCN65XF4B2PZ83D27ET55PX", "failure recovery", "Rolling back to the last stable design when evaluation fails, using error information as a prompt for the next round.", "Figure 3 failure recovery breakdown", 0.88),
  term(103, "01KSCN65XF4B2PZ83D27ET55PX", "FDTD evaluator", "Using finite-difference time-domain simulation as a forward solver to provide feedback for agent decision-making.", "evaluator latency in Table 1", 0.83),
  term(104, "01KSCN65XF4B2PZ83D27ET55PX", "self-consistency budget", "Sampling N times for the same target and taking a majority vote to improve agent output stability.", "self-consistency in §4.1", 0.71),
];

export const GRAPH_DATA = {
  nodes: [
    { id: "01KSCN65XF4B2PZ83D27ET55PX", node_type: "paper", label: "Agentic metasurface design with self-correcting language-model loops", sublabel: "2025", year: 2025, read_status: "reading", paper_count: undefined },
    { id: "01PAP2", node_type: "paper", label: "Cross-attention is overrated for long-document QA", sublabel: "2024", year: 2024, read_status: "must", paper_count: undefined },
    { id: "01PAP3", node_type: "paper", label: "Denoising diffusion probabilistic models", sublabel: "2020", year: 2020, read_status: "read", paper_count: undefined },
    { id: "01PAP4", node_type: "paper", label: "Attention is all you need", sublabel: "2017", year: 2017, read_status: "must", paper_count: undefined },
    { id: "01PAP5", node_type: "paper", label: "Sub-nm-precision atom assembly via optical tweezers", sublabel: "2023", year: 2023, read_status: "unread", paper_count: undefined },
    { id: "01PAP6", node_type: "paper", label: "Survey: post-quantum key exchange beyond Kyber", sublabel: "2024", year: 2024, read_status: "unread", paper_count: undefined },
    { id: "concept:attention mechanism", node_type: "concept", label: "attention mechanism", sublabel: "Attention computation mechanism for sequence modeling", year: undefined, read_status: undefined, paper_count: 3 },
    { id: "concept:language model", node_type: "concept", label: "language model", sublabel: "Probabilistic text generation model", year: undefined, read_status: undefined, paper_count: 3 },
    { id: "concept:metasurface", node_type: "concept", label: "metasurface", sublabel: "Ultra-thin optical surface composed of subwavelength structural units", year: undefined, read_status: undefined, paper_count: 2 },
    { id: "concept:generative model", node_type: "concept", label: "generative model", sublabel: "Model that learns data distributions and generates new samples", year: undefined, read_status: undefined, paper_count: 2 },
  ],
  edges: [
    { id: "link:1", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP4", edge_type: "builds_on", source_type: "user", confidence: 1.0, snippet: "Agentic framework uses Transformer as backbone for LLM-driven design loop." },
    { id: "link:2", source: "01PAP2", target: "01PAP4", edge_type: "extends", source_type: "user", confidence: 1.0, snippet: "Proposes replacing cross-attention with gating, a direct extension of the Transformer attention mechanism." },
    { id: "link:3", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP2", edge_type: "uses_method", source_type: "user", confidence: 1.0, snippet: "Agent uses long-context QA backbone for FDTD result parsing." },
    { id: "link:4", source: "01PAP3", target: "01PAP4", edge_type: "builds_on", source_type: "user", confidence: 1.0, snippet: "Diffusion models adopt Transformer-based denoising networks." },
    { id: "link:5", source: "01KSCN65XF4B2PZ83D27ET55PX", target: "01PAP3", edge_type: "related", source_type: "ai", confidence: 0.65, snippet: "Both use iterative refinement loops—agentic design and diffusion denoising share a multi-round correction paradigm." },
    { id: "link:6", source: "01PAP2", target: "01PAP3", edge_type: "compares", source_type: "ai", confidence: 0.55, snippet: "Both challenge established architectures: one questions cross-attention, the other GANs." },
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
      { paper_id: "01PAP4", paper_title: "Attention is all you need", paper_year: 2017, term: t, local_definition: "In natural language tasks, this term corresponds to the multi-head structure of the attention mechanism." },
    ],
  };
}

export const CONCEPTS = [
  { id: 1, name: "attention mechanism", description: "Attention computation mechanism for sequence modeling, enabling context-aware feature aggregation through query-key-value matrices.", source: "ai", created_at: now - 10 * day },
  { id: 2, name: "language model", description: "Probabilistic text generation model that learns language distributions through autoregressive or masked prediction.", source: "ai", created_at: now - 10 * day },
  { id: 3, name: "metasurface", description: "Ultra-thin optical surface composed of subwavelength structural units, capable of manipulating amplitude, phase, and polarization of incident light.", source: "ai", created_at: now - 8 * day },
  { id: 4, name: "generative model", description: "Model that learns data distributions and generates new samples, including GAN, VAE, and diffusion model paradigms.", source: "user", created_at: now - 6 * day },
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

export const COMPARISONS = [
  {
    id: 1,
    paper_ids: ["01KSCN65XF4B2PZ83D27ET55PX", "01PAP2", "01PAP4"],
    content: `## Multi-Paper Comparison Analysis

| Dimension | Agentic metasurface design | Cross-attention is overrated | Attention is all you need |
|-----------|---------------------------|------------------------------|--------------------------|
| **Problem** | Metasurface inverse design relies on human expert iteration | Cross-attention is computationally expensive in long-document QA | Sequence modeling depends on RNN/CNN, cannot be parallelized |
| **Method** | LLM agent closed-loop + FDTD evaluation | Learnable gating layer replaces cross-attention | Transformer self-attention architecture |
| **Key metric** | 8.3 rounds to converge to expert baseline | 6/8 benchmarks with no significant accuracy loss, 23% FLOPs saved | WMT translation BLEU record |
| **Limitation** | FDTD simulation ~3 min/iter is the bottleneck | 2/8 benchmarks show statistically significant drops | O(n²) complexity for very long sequences |
| **Relationship** | Uses Transformer as agent reasoning backbone | Replaces original Transformer's cross-attention | Foundation work, common basis for subsequent work |

### Key Insights
These three papers demonstrate the evolution of the Transformer architecture from proposal to application to optimization: Attention is all you need laid the foundation, Cross-attention is overrated streamlined it, and Agentic metasurface design applied it to physical design.`,
    model: "deepseek-chat",
    created_at: now - 2 * day,
    updated_at: now - 2 * day,
  },
];

export const SMART_COLLECTIONS = [
  {
    id: 1,
    name: "2024+ Must-read papers",
    rules: { type: "group", combinator: "and", rules: [
      { type: "condition", field: "year", operator: "gte", value: 2024 },
      { type: "condition", field: "read_status", operator: "equals", value: "must" },
    ]},
    created_at: now - 5 * day,
    updated_at: now - 3 * day,
  },
  {
    id: 2,
    name: "Transformer-related",
    rules: { type: "group", combinator: "or", rules: [
      { type: "condition", field: "title", operator: "contains", value: "attention" },
      { type: "condition", field: "title", operator: "contains", value: "Transformer" },
      { type: "condition", field: "tags", operator: "contains", value: "agentic" },
    ]},
    created_at: now - 4 * day,
    updated_at: now - 2 * day,
  },
];

export const READING_QUEUE = [
  { paper_id: "01PAP2", priority: 2, target_date: now + 3 * day, note: "Well-reviewed at EMNLP 2024, focus on gating alternatives", added_at: now - 2 * day, title: "Cross-attention is overrated for long-document QA", authors: "A. Chen, R. Müller", year: 2024 },
  { paper_id: "01PAP6", priority: 1, target_date: now + 7 * day, note: "PQ survey, compare Kyber with other schemes", added_at: now - day, title: "Survey: post-quantum key exchange beyond Kyber", authors: "S. Bose", year: 2024 },
  { paper_id: "01PAP4", priority: 3, target_date: null, note: "Classic must-read, cite in related work", added_at: now - 3 * day, title: "Attention is all you need", authors: "A. Vaswani, N. Shazeer, N. Parmar", year: 2017 },
  { paper_id: "01PAP5", priority: 0, target_date: now + 14 * day, note: null, added_at: now - 6 * hour, title: "Sub-nm-precision atom assembly via optical tweezers", authors: "F. Park, Y. Yamamoto", year: 2023 },
];

export const CUSTOM_FIELD_DEFS = [
  { id: 1, name: "Reproduction status", field_type: "select", options: ["Not reproduced", "In progress", "Reproduced", "Failed"], created_at: now - 10 * day },
  { id: 2, name: "Code repository", field_type: "text", options: null, created_at: now - 8 * day },
  { id: 3, name: "Rating", field_type: "number", options: null, created_at: now - 6 * day },
];

export const PAPER_CUSTOM_FIELDS = [
  { field_id: 1, field_name: "Reproduction status", field_type: "select", options: ["Not reproduced", "In progress", "Reproduced", "Failed"], value: "In progress" },
  { field_id: 2, field_name: "Code repository", field_type: "text", options: null, value: "https://github.com/example/agentic-metasurface" },
  { field_id: 3, field_name: "Rating", field_type: "number", options: null, value: "8" },
];

export const TOPIC_ALERTS = [
  { id: 1, query: "agentic metasurface design", frequency: "weekly", target_folder_id: 4, auto_import: false, last_run_at: now - 86400, created_at: now - 14 * day },
  { id: 2, query: "few-cycle ultrashort pulse generation", frequency: "daily", target_folder_id: 1, auto_import: true, last_run_at: now - 3600, created_at: now - 7 * day },
];

export const TOPIC_ALERT_RESULTS = [
  { id: 1, alert_id: 1, paper_doi: null, paper_arxiv_id: "2505.01234", title: "Agentic inverse design of photonic crystals with self-verifying FDTD loops", authors: "K. Tanaka, J. Park", year: 2025, abstract_text: "We extend the agentic design paradigm to 3D photonic crystals, achieving 92% bandgap accuracy in 12 iterations.", seen: false, added_at: now - 3600 },
  { id: 2, alert_id: 1, paper_doi: "10.1038/s41566-025-01789", paper_arxiv_id: null, title: "LLM-guided topology optimization for nanophotonics: a benchmark study", authors: "M. Hassan", year: 2025, abstract_text: "A systematic comparison of three LLM-based frameworks for nanophotonic topology optimization.", seen: false, added_at: now - 1800 },
  { id: 3, alert_id: 2, paper_doi: null, paper_arxiv_id: "2505.02345", title: "Sub-2-fs pulse generation via cascaded hollow-core compression", authors: "L. Zhou", year: 2025, abstract_text: "We demonstrate cascaded hollow-core fiber compression achieving 1.8-fs pulses at 0.3 mJ.", seen: true, added_at: now - 7200 },
];

export const SIMILAR_PAPERS = [
  { paper_id: "sim1", title: "Agentic design of photonic devices using reinforcement learning", authors: ["W. Zhang", "H. Li"], year: 2025, venue: "Nature Communications", abstract_snippet: "We combine RL with FDTD evaluation for inverse photonic design, achieving human-competitive results on 5 benchmark structures.", doi: "10.1038/s41467-025-12345", arxiv_id: "2502.08765", citation_count: 28 },
  { paper_id: "sim2", title: "Self-correcting language agents for scientific discovery", authors: ["A. Asai", "Y. Watanabe"], year: 2025, venue: "ICLR 2025", abstract_snippet: "We present a framework where LLM agents autonomously formulate hypotheses, design experiments, and iterate based on results.", doi: null, arxiv_id: "2410.15432", citation_count: 45 },
  { paper_id: "sim3", title: "Inverse design of metasurfaces with diffusion models", authors: ["P. Chen", "S. Wang"], year: 2024, venue: "Optica", abstract_snippet: "Conditional diffusion models generate metasurface geometries from target spectra in a single forward pass.", doi: "10.1364/OPTICA.500001", arxiv_id: "2405.09876", citation_count: 67 },
  { paper_id: "sim4", title: "Transformer-based surrogate models for electromagnetic simulation", authors: ["R. Müller", "K. Tanaka"], year: 2024, venue: "ACS Photonics", abstract_snippet: "A Transformer surrogate replaces FDTD with 1000x speedup at <1% error for periodic metasurface cells.", doi: "10.1021/acsphotonics.4c01234", arxiv_id: null, citation_count: 34 },
];

export const LIT_REVIEW = {
  markdown: `# Literature Review: Intelligent Metasurface Design and Attention Mechanisms

## 1. Introduction

In recent years, the application of large language models (LLMs) in scientific computing has attracted widespread attention. This review focuses on the application of Transformer attention mechanisms in metasurface inverse design, covering three key dimensions from foundational architecture to practical applications.

## 2. Foundational Architecture of Attention Mechanisms

### 2.1 Core Contributions of the Transformer

The Transformer architecture proposed by Vaswani et al. [3] revolutionized the sequence modeling paradigm. Its core innovation lies in completely replacing traditional recurrent and convolutional structures with self-attention mechanisms, enabling highly parallelized training.

### 2.2 Architectural Optimization Directions

Chen and Müller [2] questioned the cross-attention layers in Transformers. They found that in long-document QA tasks, replacing cross-attention with learnable gating layers maintains statistically insignificant accuracy differences on 6/8 benchmarks while saving 23% computational overhead.

## 3. Agent-Driven Metasurface Design

### 3.1 Closed-Loop Design Framework

Liu et al. [1] proposed an innovative closed-loop agentic framework using LLMs as the core of design decisions. Through multi-round iteration of "design → FDTD evaluation → self-reflection → correction," the system reaches human-expert level in an average of 8.3 rounds.

### 3.2 Failure Recovery Mechanism

Notably, the failure recovery loop introduced by this framework reduces average attempts by 41%, a mechanism of significant importance for improving automated design reliability.

## 4. Key Findings and Research Trends

| Research Direction | Key Metric | Trend |
|-------------------|-----------|-------|
| Attention Architecture | 23% FLOPs savings | Architectural streamlining |
| Agent Design | 8.3 rounds convergence | Increasing automation |
| Metasurface Applications | 3 benchmark targets | Expanding application scope |

## 5. Conclusion

These three papers demonstrate the complete chain from foundational architectural innovation to domain applications. Future research could focus on FDTD simulation acceleration (currently ~3 min/iter is the main bottleneck) and extending the agentic framework to more physical design scenarios.

---

**References**

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

export const NOTE_SECTIONS = [
  { id: 1, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "overview", content: "## Quick Read\n\nThis paper's main contribution is wrapping metasurface inverse design into an LLM agent. The agent maintains design context, outputs parameter JSON, calls FDTD evaluation, parses spectra, self-reflects, and loops 8.3 times on average to reach human-expert level.", source: "ai", sort_order: 0, created_at: now - 2 * day, updated_at: now - day },
  { id: 2, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "key_numbers", content: "## Key Numbers\n\n- 8.3 rounds average convergence to expert baseline\n- Failure recovery reduces attempts by 41%\n- FDTD single-step latency 3 min remains the bottleneck\n- Inference budget has a logarithmic relationship with final quality", source: "ai", sort_order: 1, created_at: now - 2 * day, updated_at: now - day },
  { id: 3, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "method_notes", content: "## Method Notes\n\nAgent core loop:\n1. Read current design context\n2. Output JSON-formatted unit parameters\n3. Call FDTD simulation evaluation\n4. Parse returned spectrum\n5. Self-reflect and correct\n\nFailure rollback mechanism: roll back to the last stable design when evaluation results are below threshold.", source: "user", sort_order: 2, created_at: now - 2 * day, updated_at: now - 3600 },
  { id: 4, paper_id: "01KSCN65XF4B2PZ83D27ET55PX", section_key: "todo", content: "## To-Do\n\n- [ ] Verify performance on mesoscale structures\n- [ ] Compare agentic framework cost with traditional topology optimization\n- [ ] Reproduce failure recovery data from Table 2\n- [ ] Contact authors for evaluator harness code", source: "user", sort_order: 3, created_at: now - 2 * day, updated_at: now - 3600 },
];

export const ASK_CONVERSATION = [
  { role: "user", content: "Which papers discuss limitations of chirped pulse amplification?" },
  { role: "assistant", content: ASK_RESULT.answer },
  { role: "user", content: "Among post-compression approaches, which has the most potential to break sub-4-fs?" },
  { role: "assistant", content: "Based on the library, the post-compression approach with the most potential to break sub-4-fs is hollow-core fiber post-compression [1]. Krausz 2021's experiment already demonstrated sub-4-fs results, with key advantages:\n\n1. **Controllable nonlinearity**: By adjusting fiber length and gas pressure, SPM accumulation can be precisely controlled.\n2. **Energy scalability**: Compared to solid-state thin plate approaches [3], hollow-core fibers have higher tolerance for beam quality.\n3. **Carrier-envelope phase preservation**: The weak dispersion characteristics of hollow-core fibers favor CEP stability.\n\nHowever, two bottlenecks remain: thermal lensing limits average power scaling, and the fiber damage threshold sets a peak power ceiling. Vernaleken 2022 [2]'s multi-pass cell approach has advantages in energy (0.5 mJ @ 6 fs), but entering the sub-4-fs regime still requires additional post-compression cascading.\n\n[1] Krausz 2021, Few-cycle ultrahigh-intensity pulses by hollow-core fiber post-compression\n[2] Vernaleken 2022, Multi-pass cell compression with 0.5 mJ output at 6 fs\n[3] L'Huillier 2023, Solid-state thin-plate post-compression below 5 fs" },
];
