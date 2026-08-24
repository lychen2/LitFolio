import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { useState } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import { api, type ReaderAskResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const READER_ASK_MAX_QUESTION_CHARS = 2_000;

type PdfSelectionAskBoxProps = {
  paperId: string;
  selection: string;
  onClose: () => void;
};

export function PdfSelectionAskBox({ paperId, selection, onClose }: PdfSelectionAskBoxProps) {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ReaderAskResult | null>(null);
  const ask = useMutation({
    mutationFn: (input: string) =>
      api.readerAskPaper({
        request: {
          paperId,
          selection: { text: selection },
          highlightId: null,
          revisionId: null,
          maxBodyChars: null,
        },
        question: input,
      }),
    onSuccess: setResult,
  });

  function submit() {
    if (ask.isPending) return;
    ask.mutate(question.slice(0, READER_ASK_MAX_QUESTION_CHARS));
  }

  return (
    <div className="absolute bottom-4 right-4 z-30 w-[min(28rem,calc(100%-2rem))] litera-panel shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-litera-line px-3 py-2">
        <div className="text-xs font-medium text-litera-text">{t("reader.askSelectionTitle")}</div>
        <button type="button" className="text-litera-mute hover:text-litera-text" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 p-3">
        <blockquote className="max-h-24 overflow-auto border-l-2 border-litera-accent/50 pl-2 text-[11px] leading-5 text-litera-mute">
          {selection}
        </blockquote>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("reader.askSelectionPlaceholder")}
          className="litera-input h-20 w-full resize-none text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-litera-mute">{t("reader.askSelectionHint")}</span>
          <button type="button" className="litera-btn-primary text-xs" disabled={ask.isPending} onClick={submit}>
            {ask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {t("reader.askSelectionSend")}
          </button>
        </div>
        {ask.error && (
          <div className="text-xs text-litera-error">
            {t("reader.askSelectionFailed", { message: ask.error instanceof Error ? ask.error.message : String(ask.error) })}
          </div>
        )}
        {result && (
          <div className="max-h-72 overflow-auto rounded-md border border-litera-line bg-litera-paper/40 p-3">
            <MarkdownView content={result.answer} className="markdown-body text-xs leading-6" />
          </div>
        )}
      </div>
    </div>
  );
}
