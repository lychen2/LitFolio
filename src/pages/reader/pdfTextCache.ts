type PdfTextCacheApi = {
  paperSetPdfText: (paperId: string, text: string) => Promise<unknown>;
};

type PdfTextCacheQueryClient = {
  invalidateQueries: (options: { queryKey: readonly [string, string] }) => Promise<unknown> | unknown;
};

export async function pushPdfTextCacheAndInvalidateTranslations({
  paperId,
  text,
  api,
  queryClient,
}: {
  paperId: string;
  text: string;
  api: PdfTextCacheApi;
  queryClient: PdfTextCacheQueryClient;
}) {
  if (!text) return;
  await api.paperSetPdfText(paperId, text);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["paperTranslatedMarkdown", paperId] }),
    queryClient.invalidateQueries({ queryKey: ["paperMarkdown", paperId] }),
  ]);
}
