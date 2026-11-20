import { invokeParsed } from "@/lib/apiInvoke";
import {
  booleanField,
  field,
  nullableNumberField,
  nullableStringField,
  numberField,
  object,
  parseArray,
  schemaError,
  stringArrayField,
  stringField,
} from "@/lib/apiSchemaCore";

export interface LiteratureNetworkNode {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  libraryPaperId: string | null;
  isSeed: boolean;
  groupId: string | null;
  citationCount: number | null;
  score: number;
}

export type LiteratureNetworkEdgeKind = "citation" | "co_citation" | "shared_reference";

export interface LiteratureNetworkEvidence {
  id: string;
  title: string;
  url: string;
}

export interface LiteratureNetworkEdge {
  /** For a citation, the source cites the target. Indirect edges are undirected. */
  source: string;
  target: string;
  kind: LiteratureNetworkEdgeKind;
  /** Citing work, common citing works, or common references, respectively. */
  evidence: LiteratureNetworkEvidence[];
}

export interface LiteratureNetworkGroup {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface LiteratureNetwork {
  nodes: LiteratureNetworkNode[];
  edges: LiteratureNetworkEdge[];
  groups: LiteratureNetworkGroup[];
  unresolvedSeedIds: string[];
}

function parseNode(value: unknown, path: string): LiteratureNetworkNode {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    title: stringField(obj, "title", path),
    authors: stringArrayField(obj, "authors", path),
    year: nullableNumberField(obj, "year", path),
    venue: nullableStringField(obj, "venue", path),
    doi: nullableStringField(obj, "doi", path),
    arxivId: nullableStringField(obj, "arxivId", path),
    url: nullableStringField(obj, "url", path),
    libraryPaperId: nullableStringField(obj, "libraryPaperId", path),
    isSeed: booleanField(obj, "isSeed", path),
    groupId: nullableStringField(obj, "groupId", path),
    citationCount: nullableNumberField(obj, "citationCount", path),
    score: numberField(obj, "score", path),
  };
}

function parseEdge(value: unknown, path: string): LiteratureNetworkEdge {
  const obj = object(value, path);
  const kind = stringField(obj, "kind", path);
  if (kind !== "citation" && kind !== "co_citation" && kind !== "shared_reference") {
    throw schemaError(`${path}.kind`, "citation, co_citation or shared_reference", kind);
  }
  const evidence = parseArray(field(obj, "evidence", path), `${path}.evidence`, (item, itemPath) => {
    const witness = object(item, itemPath);
    return {
      id: stringField(witness, "id", itemPath),
      title: stringField(witness, "title", itemPath),
      url: stringField(witness, "url", itemPath),
    };
  });
  if (evidence.length === 0) {
    throw schemaError(`${path}.evidence`, "at least one witness", evidence);
  }
  return {
    source: stringField(obj, "source", path),
    target: stringField(obj, "target", path),
    kind,
    evidence,
  };
}

function parseLiteratureNetwork(value: unknown, path: string): LiteratureNetwork {
  const obj = object(value, path);
  return {
    nodes: parseArray(field(obj, "nodes", path), `${path}.nodes`, parseNode),
    edges: parseArray(field(obj, "edges", path), `${path}.edges`, parseEdge),
    groups: parseArray(field(obj, "groups", path), `${path}.groups`, (item, itemPath) => {
      const group = object(item, itemPath);
      return {
        id: stringField(group, "id", itemPath),
        label: stringField(group, "label", itemPath),
        nodeIds: stringArrayField(group, "nodeIds", itemPath),
      };
    }),
    unresolvedSeedIds: stringArrayField(obj, "unresolvedSeedIds", path),
  };
}

/** Fetch a citation network for one to five papers selected from the local library. */
export function loadLiteratureNetwork(paperIds: string[]): Promise<LiteratureNetwork> {
  return invokeParsed("literature_network", { paperIds }, parseLiteratureNetwork);
}
