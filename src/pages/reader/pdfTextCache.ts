type PdfTextCacheApi = {
  paperSetPdfText: (paperId: string, text: string) => Promise<unknown>;
};

type PdfTextCacheQueryClient = {
  invalidateQueries: (options: { queryKey: readonly ["paperTranslatedMarkdown", string] }) => Promise<unknown> | unknown;
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
  await queryClient.invalidateQueries({ queryKey: ["paperTranslatedMarkdown", paperId] });
}
