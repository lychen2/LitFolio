import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileArchive, FileText, Loader2, Paperclip, Save, Trash2 } from "lucide-react";
import { api, type PaperSupplement } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const SUPPLEMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "md",
  "zip",
  "rar",
  "7z",
  "png",
  "jpg",
  "jpeg",
];

export function PaperSupplementsSection({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const supplements = useQuery({
    queryKey: ["paper-supplements", paperId],
    queryFn: () => api.paperSupplementsList(paperId),
  });
  const add = useMutation({
    mutationFn: async () => {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Supplement", extensions: SUPPLEMENT_EXTENSIONS }],
      });
      if (!selected || Array.isArray(selected)) return null;
      return api.paperSupplementAddFile(paperId, selected);
    },
    onSuccess: (created) => {
      if (!created) return;
      qc.invalidateQueries({ queryKey: ["paper-supplements", paperId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.paperSupplementDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-supplements", paperId] }),
  });

  return (
    <section className="rounded-xl border border-litera-line bg-litera-panel/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-litera-text">{t("supplements.title")}</h3>
          <p className="text-xs text-litera-mute mt-1">{t("supplements.description")}</p>
        </div>
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {t("supplements.add")}
        </button>
      </div>
      {supplements.isLoading && <div className="text-xs text-litera-mute">{t("common.loading")}</div>}
      {supplements.data && supplements.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-litera-line px-3 py-4 text-xs text-litera-mute">
          {t("supplements.empty")}
        </div>
      )}
      {supplements.data && supplements.data.length > 0 && (
        <div className="space-y-2">
          {supplements.data.map((supplement) => (
            <SupplementItem
              key={supplement.id}
              supplement={supplement}
              onDelete={() => remove.mutate(supplement.id)}
            />
          ))}
        </div>
      )}
      {add.error && <ErrorLine message={(add.error as Error).message} />}
      {remove.error && <ErrorLine message={(remove.error as Error).message} />}
    </section>
  );
}

function SupplementItem({ supplement, onDelete }: { supplement: PaperSupplement; onDelete: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [note, setNote] = useState(supplement.note);
  useEffect(() => setNote(supplement.note), [supplement.note]);
  const isWord = supplement.file_kind === "doc" || supplement.file_kind === "docx";
  const isPdf = supplement.file_kind === "pdf" || !!supplement.converted_pdf_path;
  const openOriginal = useMutation({ mutationFn: () => api.paperSupplementOpen(supplement.id, false) });
  const openPdf = useMutation({ mutationFn: () => api.paperSupplementOpen(supplement.id, true) });
  const convert = useMutation({
    mutationFn: () => api.paperSupplementConvertDocxToPdf(supplement.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["paper-supplements", supplement.paper_id] });
      await api.paperSupplementOpen(supplement.id, true);
    },
  });
  const saveNote = useMutation({
    mutationFn: () => api.paperSupplementUpdateNote(supplement.id, note),
    onSuccess: (updated) => {
      qc.setQueryData<PaperSupplement[]>(["paper-supplements", supplement.paper_id], (current) =>
        current?.map((item) => item.id === updated.id ? updated : item),
      );
    },
  });

  async function handleOpen() {
    if (!isWord) {
      await openOriginal.mutateAsync();
      return;
    }
    if (supplement.converted_pdf_path) {
      await openPdf.mutateAsync();
      return;
    }
    if (window.confirm(t("supplements.convertPrompt"))) {
      await convert.mutateAsync();
    } else {
      await openOriginal.mutateAsync();
    }
  }

  const busy = openOriginal.isPending || openPdf.isPending || convert.isPending;

  return (
    <article className="rounded-lg border border-litera-line/80 bg-litera-paper/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          {isPdf ? <FileText className="mt-0.5 h-4 w-4 shrink-0 text-litera-accent" /> : <FileArchive className="mt-0.5 h-4 w-4 shrink-0 text-litera-mute" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-litera-text">{supplement.title}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-litera-mute">
              .{supplement.file_kind}{supplement.converted_pdf_path ? ` · ${t("supplements.convertedPdfReady")}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={handleOpen} disabled={busy} className="litera-btn text-[11px] px-2 py-1 disabled:opacity-50">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
            {t("common.open")}
          </button>
          <button onClick={onDelete} className="litera-btn text-[11px] px-2 py-1 text-litera-error">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("supplements.notePlaceholder")}
        className="litera-input min-h-20 w-full resize-y text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-litera-mute break-all">{supplement.file_path}</div>
        <button
          onClick={() => saveNote.mutate()}
          disabled={note === supplement.note || saveNote.isPending}
          className="litera-btn text-[11px] px-2 py-1 disabled:opacity-50"
        >
          {saveNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {t("common.save")}
        </button>
      </div>
      {convert.error && <ErrorLine message={(convert.error as Error).message} />}
      {openOriginal.error && <ErrorLine message={(openOriginal.error as Error).message} />}
      {openPdf.error && <ErrorLine message={(openPdf.error as Error).message} />}
      {saveNote.error && <ErrorLine message={(saveNote.error as Error).message} />}
    </article>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <div className="break-all text-[11px] text-litera-error">✕ {message}</div>;
}
