import type {
  LiteratureNetwork,
  LiteratureNetworkEdgeKind,
  LiteratureNetworkEvidence,
  LiteratureNetworkNode,
} from "./network";

interface CitationWork {
  id: string;
  title: string;
  url: string | null;
  node?: LiteratureNetworkNode;
}

interface CitationMatch {
  node: LiteratureNetworkNode;
  url: string | null;
  evidenceKinds: ReadonlySet<LiteratureNetworkEdgeKind>;
}

export interface CitationPerspectiveEntry {
  work: CitationWork;
  matches: CitationMatch[];
}

export function deriveCitationPerspectives(result: LiteratureNetwork) {
  const works = new Map<string, CitationWork>(result.nodes.map((node) => [node.id, {
    id: node.id, title: node.title, url: node.url, node,
  }]));
  const citations = new Map<CitationWork, Map<CitationWork, Set<LiteratureNetworkEdgeKind>>>();

  function resolveWitness(witness: LiteratureNetworkEvidence) {
    const known = works.get(witness.id);
    if (known) {
      known.url ??= witness.url;
      return known;
    }
    const work = { id: witness.id, title: witness.title, url: witness.url };
    works.set(work.id, work);
    return work;
  }

  function addCitation(citing: CitationWork, cited: CitationWork, kind: LiteratureNetworkEdgeKind) {
    let references = citations.get(citing);
    if (!references) {
      references = new Map();
      citations.set(citing, references);
    }
    let evidenceKinds = references.get(cited);
    if (!evidenceKinds) {
      evidenceKinds = new Set();
      references.set(cited, evidenceKinds);
    }
    evidenceKinds.add(kind);
  }

  for (const { source, target, kind, evidence } of result.edges) {
    const left = works.get(source);
    const right = works.get(target);
    if (!left?.node || !right?.node || left === right) continue;

    if (kind === "citation") {
      const citingRecord = evidence.find((witness) => witness.id === source);
      if (citingRecord) left.url ??= citingRecord.url;
      addCitation(left, right, kind);
      continue;
    }

    for (const witness of evidence) {
      if (witness.id === source || witness.id === target) continue;
      const work = resolveWitness(witness);
      // Rust emits the common cited work for shared_reference and the common citing work for co_citation.
      if (kind === "shared_reference") {
        addCitation(left, work, kind);
        addCitation(right, work, kind);
      } else {
        addCitation(work, left, kind);
        addCitation(work, right, kind);
      }
    }
  }

  const prior = new Map<CitationWork, CitationMatch[]>();
  const subsequent = new Map<CitationWork, CitationMatch[]>();
  for (const [citing, references] of citations) {
    for (const [cited, evidenceKinds] of references) {
      if (citing.node) {
        const match = { node: citing.node, url: citing.url, evidenceKinds };
        const matches = prior.get(cited);
        if (matches) matches.push(match);
        else prior.set(cited, [match]);
      }
      if (cited.node) {
        const match = { node: cited.node, url: cited.url, evidenceKinds };
        const matches = subsequent.get(citing);
        if (matches) matches.push(match);
        else subsequent.set(citing, [match]);
      }
    }
  }

  function rank(entries: Map<CitationWork, CitationMatch[]>): CitationPerspectiveEntry[] {
    const ranked: CitationPerspectiveEntry[] = [];
    for (const [work, matches] of entries) {
      if (matches.length < 2) continue;
      matches.sort((a, b) => a.node.title.localeCompare(b.node.title) || a.node.id.localeCompare(b.node.id));
      ranked.push({ work, matches });
    }
    return ranked.sort((a, b) => b.matches.length - a.matches.length
      || a.work.title.localeCompare(b.work.title)
      || a.work.id.localeCompare(b.work.id));
  }

  return { prior: rank(prior), subsequent: rank(subsequent) };
}
