import type { Paper } from "@/lib/api";

export interface DoiImportApi {
  doiAddWithPdf: (doi: string) => Promise<Paper>;
  paperLinkCreateOrGet: (
    sourcePaperId: string,
    targetPaperId: string,
    relation: "builds_on" | "extends" | "contradicts" | "related",
    note?: string | null,
  ) => Promise<unknown>;
}

export async function importDoiWithAutoPdfAndLink(
  api: DoiImportApi,
  sourcePaperId: string,
  doi: string,
): Promise<Paper> {
  const paper = await api.doiAddWithPdf(doi);
  await api.paperLinkCreateOrGet(
    sourcePaperId,
    paper.id,
    "builds_on",
    `DOI link clicked in PDF: ${doi}`,
  );
  return paper;
}
