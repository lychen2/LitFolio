import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useImportedArxivIds() {
  return useQuery({
    queryKey: ["papers", "arxiv-ids"],
    queryFn: api.papersAllArxivIds,
    staleTime: 60_000,
  });
}
