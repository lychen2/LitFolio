import type { Paper, ReadStatus, Tag } from "@/lib/api";

export type LibraryFilterState = {
  year: string;
  readStatus: "" | ReadStatus;
  tagId: string;
};

export function filterLibraryPapers(
  papers: Paper[],
  tagsByPaper: Record<string, Tag[]>,
  filters: LibraryFilterState,
): Paper[] {
  const year = filters.year.trim();
  const tagId = Number(filters.tagId);
  return papers.filter((paper) => {
    if (year && String(paper.year ?? "") !== year) return false;
    if (filters.readStatus && paper.read_status !== filters.readStatus) return false;
    if (filters.tagId && !tagsByPaper[paper.id]?.some((tag) => tag.id === tagId)) return false;
    return true;
  });
}

export function hasActiveLibraryFilters(filters: LibraryFilterState): boolean {
  return !!(filters.year.trim() || filters.readStatus || filters.tagId);
}
