/**
 * Curated arXiv categories with friendly labels, grouped by primary archive.
 * Source: https://arxiv.org/category_taxonomy (Sep 2026 snapshot, common subset).
 */
export interface ArxivCategory {
  id: string;        // canonical id like "physics.optics"
  label: string;     // friendly name
}

export interface ArxivGroup {
  label: string;
  categories: ArxivCategory[];
}

export const ARXIV_GROUPS: ArxivGroup[] = [
  {
    label: "Physics",
    categories: [
      { id: "physics.optics",    label: "Optics" },
      { id: "physics.atom-ph",   label: "Atomic Physics" },
      { id: "physics.atm-clus",  label: "Atomic / Molecular Clusters" },
      { id: "physics.app-ph",    label: "Applied Physics" },
      { id: "physics.bio-ph",    label: "Biological Physics" },
      { id: "physics.chem-ph",   label: "Chemical Physics" },
      { id: "physics.class-ph",  label: "Classical Physics" },
      { id: "physics.comp-ph",   label: "Computational Physics" },
      { id: "physics.data-an",   label: "Data Analysis" },
      { id: "physics.ed-ph",     label: "Physics Education" },
      { id: "physics.flu-dyn",   label: "Fluid Dynamics" },
      { id: "physics.gen-ph",    label: "General Physics" },
      { id: "physics.geo-ph",    label: "Geophysics" },
      { id: "physics.ins-det",   label: "Instrumentation" },
      { id: "physics.med-ph",    label: "Medical Physics" },
      { id: "physics.plasm-ph",  label: "Plasma Physics" },
      { id: "physics.soc-ph",    label: "Physics and Society" },
      { id: "physics.space-ph",  label: "Space Physics" },
    ],
  },
  {
    label: "Quantum Physics",
    categories: [{ id: "quant-ph", label: "Quantum Physics" }],
  },
  {
    label: "Condensed Matter",
    categories: [
      { id: "cond-mat.dis-nn",    label: "Disordered Systems & Neural Networks" },
      { id: "cond-mat.mes-hall",  label: "Mesoscale & Nanoscale" },
      { id: "cond-mat.mtrl-sci",  label: "Materials Science" },
      { id: "cond-mat.quant-gas", label: "Quantum Gases" },
      { id: "cond-mat.soft",      label: "Soft Condensed Matter" },
      { id: "cond-mat.stat-mech", label: "Statistical Mechanics" },
      { id: "cond-mat.str-el",    label: "Strongly Correlated Electrons" },
      { id: "cond-mat.supr-con",  label: "Superconductivity" },
    ],
  },
  {
    label: "Astrophysics",
    categories: [
      { id: "astro-ph.CO", label: "Cosmology" },
      { id: "astro-ph.EP", label: "Earth & Planetary" },
      { id: "astro-ph.GA", label: "Galaxies" },
      { id: "astro-ph.HE", label: "High Energy" },
      { id: "astro-ph.IM", label: "Instrumentation" },
      { id: "astro-ph.SR", label: "Solar & Stellar" },
    ],
  },
  {
    label: "High Energy Physics",
    categories: [
      { id: "hep-th",  label: "Theory" },
      { id: "hep-ph",  label: "Phenomenology" },
      { id: "hep-ex",  label: "Experiment" },
      { id: "hep-lat", label: "Lattice" },
    ],
  },
  {
    label: "Mathematics",
    categories: [
      { id: "math.AG", label: "Algebraic Geometry" },
      { id: "math.AT", label: "Algebraic Topology" },
      { id: "math.AP", label: "Analysis of PDEs" },
      { id: "math.CO", label: "Combinatorics" },
      { id: "math.DG", label: "Differential Geometry" },
      { id: "math.NA", label: "Numerical Analysis" },
      { id: "math.NT", label: "Number Theory" },
      { id: "math.PR", label: "Probability" },
      { id: "math.ST", label: "Statistics Theory" },
    ],
  },
  {
    label: "Computer Science",
    categories: [
      { id: "cs.AI",   label: "AI" },
      { id: "cs.CL",   label: "Computation & Language" },
      { id: "cs.CV",   label: "Computer Vision" },
      { id: "cs.LG",   label: "Machine Learning" },
      { id: "cs.NE",   label: "Neural & Evolutionary" },
      { id: "cs.IR",   label: "Information Retrieval" },
      { id: "cs.RO",   label: "Robotics" },
      { id: "cs.GR",   label: "Graphics" },
      { id: "cs.HC",   label: "HCI" },
      { id: "cs.DC",   label: "Distributed Computing" },
      { id: "cs.CR",   label: "Cryptography & Security" },
      { id: "cs.OS",   label: "Operating Systems" },
      { id: "cs.PL",   label: "Programming Languages" },
      { id: "cs.SE",   label: "Software Engineering" },
      { id: "cs.SY",   label: "Systems & Control" },
    ],
  },
  {
    label: "Statistics",
    categories: [
      { id: "stat.ME", label: "Methodology" },
      { id: "stat.ML", label: "Machine Learning" },
      { id: "stat.AP", label: "Applications" },
    ],
  },
  {
    label: "Biology",
    categories: [
      { id: "q-bio.BM", label: "Biomolecules" },
      { id: "q-bio.GN", label: "Genomics" },
      { id: "q-bio.NC", label: "Neurons & Cognition" },
      { id: "q-bio.PE", label: "Populations & Evolution" },
    ],
  },
  {
    label: "Electrical Engineering",
    categories: [
      { id: "eess.AS", label: "Audio & Speech Processing" },
      { id: "eess.IV", label: "Image & Video Processing" },
      { id: "eess.SP", label: "Signal Processing" },
      { id: "eess.SY", label: "Systems & Control" },
    ],
  },
];

export function findCategoryLabel(id: string): string {
  for (const g of ARXIV_GROUPS) {
    const c = g.categories.find((x) => x.id === id);
    if (c) return c.label;
  }
  return id;
}
