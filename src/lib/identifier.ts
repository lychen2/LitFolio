export interface SourceIdentifier {
  arxivId: string | null;
  doi: string | null;
}

export function extractSourceIdentifier(url: string): SourceIdentifier {
  const arxiv = url.match(/arxiv\.org\/(?:abs|pdf|html|format)\/([\w\-./]+?)(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i);
  const doi = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  return {
    arxivId: arxiv ? arxiv[1] : null,
    doi: doi ? doi[1] : null,
  };
}

export function extractIdentifier(url: string): string | null {
  const { arxivId, doi } = extractSourceIdentifier(url);
  return arxivId ?? doi;
}
