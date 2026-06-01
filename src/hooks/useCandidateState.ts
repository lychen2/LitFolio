import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CandidatePaper } from "@/lib/api";

export interface CandidateIdentity {
  title: string;
  doi?: string | null;
  arxiv_id?: string | null;
}

export function useCandidateLookup(includeIgnored = true) {
  const query = useQuery({
    queryKey: ["candidates", "lookup", includeIgnored],
    queryFn: () => api.candidatesList(includeIgnored),
  });
  const index = useMemo(() => buildCandidateIndex(query.data ?? []), [query.data]);
  return {
    ...query,
    findCandidate: (identity: CandidateIdentity) => findCandidate(index, identity),
  };
}

export function candidateIsHidden(candidate: CandidatePaper | null | undefined) {
  return candidate?.status === "ignored";
}

function buildCandidateIndex(candidates: CandidatePaper[]) {
  const byDoi = new Map<string, CandidatePaper>();
  const byArxiv = new Map<string, CandidatePaper>();
  const byTitle = new Map<string, CandidatePaper>();

  for (const candidate of candidates) {
    const doi = normalizeDoi(candidate.doi);
    const arxiv = normalizeArxiv(candidate.arxiv_id);
    const title = normalizeTitle(candidate.title);
    if (doi) byDoi.set(doi, candidate);
    if (arxiv) byArxiv.set(arxiv, candidate);
    if (title) byTitle.set(title, candidate);
  }

  return { byDoi, byArxiv, byTitle };
}

function findCandidate(
  index: ReturnType<typeof buildCandidateIndex>,
  identity: CandidateIdentity,
) {
  const doi = normalizeDoi(identity.doi);
  const arxiv = normalizeArxiv(identity.arxiv_id);
  const title = normalizeTitle(identity.title);
  return (doi && index.byDoi.get(doi))
    || (arxiv && index.byArxiv.get(arxiv))
    || (title && index.byTitle.get(title))
    || null;
}

function normalizeDoi(value?: string | null) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .trim() ?? "";
}

function normalizeArxiv(value?: string | null) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/^arxiv:/, "")
    .replace(/^https?:\/\/arxiv\.org\/abs\//, "")
    .replace(/v\d+$/, "")
    .trim() ?? "";
}

function normalizeTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "");
}
