import { useCallback, useRef, useState } from "react";
import { pickSinglePdf, type ArxivDraft } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { usePdfDropTarget } from "@/hooks/usePdfDropTarget";
import { DraftSavePanel, IdentifierPanel } from "./ArxivDoiPanels";
import {
  detectSourceKind,
  useAutoDownloadMutation,
  useFetchMetaMutation,
  useLinkBackToFeed,
  useMarkCandidateImported,
  usePrefillDraft,
  usePrepareFeedDraftMutation,
  useSaveWithPdfMutation,
  type AutoDownloadFailure,
} from "./ArxivDoiWorkflow";
import { type ImportSource } from "./types";

export function ArxivDoiTab({ source }: { source: ImportSource }) {
  const t = useT();
  const [value, setValue] = useState(source.prefill ?? "");
  const [draft, setDraft] = useState<ArxivDraft | null>(null);
  const [sourceKind, setSourceKind] = useState<"arxiv" | "doi" | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoDownloadFailure, setAutoDownloadFailure] =
    useState<AutoDownloadFailure | null>(null);
  const pdfDropRef = useRef<HTMLDivElement>(null);
  const trimmed = value.trim();
  const kind = detectSourceKind(trimmed);

  const fetchMeta = useFetchMetaMutation({
    value,
    source,
    setValue,
    setDraft,
    setSourceKind,
    setError,
    setSuccess,
  });
  const prepareFeedDraft = usePrepareFeedDraftMutation({
    source,
    fetchMeta,
    setValue,
    setDraft,
    setSourceKind,
    setError,
    setSuccess,
  });
  usePrefillDraft(source, prepareFeedDraft.mutate, fetchMeta.mutate, setValue);
  const linkBackToFeed = useLinkBackToFeed(source);
  const markCandidateImported = useMarkCandidateImported(source);
  const saveWithPdf = useSaveWithPdfMutation({
    draft,
    source,
    sourceKind,
    selectedPdf,
    trimmed,
    linkBackToFeed,
    markCandidateImported,
    reset,
    setError,
    setSuccess,
  });
  const autoDownload = useAutoDownloadMutation({
    draft,
    source,
    sourceKind,
    trimmed,
    linkBackToFeed,
    markCandidateImported,
    reset,
    setError,
    setSuccess,
    setAutoDownloadFailure,
  });

  function reset() {
    setValue("");
    setDraft(null);
    setSourceKind(null);
    setSelectedPdf(null);
    setAutoDownloadFailure(null);
  }

  function submit() {
    if (!trimmed) return;
    if (!kind) {
      setError(t("import.error.invalidId"));
      return;
    }
    setError(null);
    setSuccess(null);
    setAutoDownloadFailure(null);
    fetchMeta.mutate(trimmed);
  }

  async function pickPdf() {
    try {
      const path = await pickSinglePdf();
      if (path) {
        setSelectedPdf(path);
        setAutoDownloadFailure(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const fetching = fetchMeta.isPending || prepareFeedDraft.isPending;
  const saving = saveWithPdf.isPending || autoDownload.isPending;
  const handlePdfDrop = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setSelectedPdf(paths[0]);
    setAutoDownloadFailure(null);
  }, []);
  usePdfDropTarget(pdfDropRef, handlePdfDrop, !!draft && !saving);

  return (
    <div className="max-w-2xl space-y-4">
      <IdentifierPanel
        value={value}
        setValue={setValue}
        fetching={fetching}
        error={error}
        success={success}
        onSubmit={submit}
      />
      {draft && (
        <DraftSavePanel
          draft={draft}
          sourceKind={sourceKind}
          selectedPdf={selectedPdf}
          autoDownloadFailure={autoDownloadFailure}
          saving={saving}
          autoPending={autoDownload.isPending}
          savePending={saveWithPdf.isPending}
          pdfDropRef={pdfDropRef}
          onPickPdf={pickPdf}
          onAutoDownload={() => autoDownload.mutate()}
          onSave={() => saveWithPdf.mutate()}
          onReset={reset}
        />
      )}
    </div>
  );
}
