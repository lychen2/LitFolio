import type { QueryClient } from "@tanstack/react-query";

import type { Paper, ReadStatus } from "@/lib/api";

export function updatePaperStatusCache(qc: QueryClient, paperId: string, status: ReadStatus) {
  qc.setQueriesData(
    {
      predicate: ({ queryKey }) =>
        queryKey[0] === "papers" && (queryKey[1] === "list" || queryKey[1] === "recent"),
    },
    (current) => {
      if (!Array.isArray(current)) return current;
      return current.map((paper) => (paper.id === paperId ? { ...paper, read_status: status } : paper));
    },
  );
  qc.setQueryData<Paper | null>(["paper", paperId], (current) =>
    current ? { ...current, read_status: status } : current,
  );
}
