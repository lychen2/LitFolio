import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ExternalLink, FileText, Languages, Loader2, X,
} from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";

export function PaperDetailDrawer({
  paper, onClose,
}: {
  paper: Paper;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const translate = useMutation({
    mutationFn: () => api.paperTranslate(paper.id, llmLanguageNameFor(lang)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col"
      >
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2">library metadata</div>
            <h2 className="font-serif text-xl leading-tight mt-1">{paper.title}</h2>
            {paper.title_translated && <p className="text-sm text-litera-accent mt-2">{paper.title_translated}</p>}
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            翻译标题和摘要
          </button>
          {paper.pdf_path && (
            <Link to={`/reader/${paper.id}`} className="litera-btn-primary text-xs">
              <BookOpen className="h-3.5 w-3.5" /> 阅读 PDF
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <Meta paper={paper} />
          <Section title="摘要" body={paper.abstract_text ?? "(无摘要)"} />
          {paper.abstract_translated && <Section title="摘要译文" body={paper.abstract_translated} accent />}
          {paper.tldr && <Section title="速读" body={paper.tldr} accent />}
          {paper.key_findings.length > 0 && <Section title="关键发现" body={paper.key_findings.join("\n")} />}
          {translate.error && <ErrorLine error={translate.error} />}
        </div>
      </div>
    </div>
  );
}

function Meta({ paper }: { paper: Paper }) {
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">作者</dt>
      <dd>{paper.authors.join(", ") || "(unknown)"}</dd>
      <dt className="text-litera-mute">年份</dt>
      <dd>{paper.year ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">Venue</dt>
      <dd>{paper.venue ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">DOI</dt>
      <dd className="font-mono">{paper.doi ?? "(none)"}</dd>
      <dt className="text-litera-mute">arXiv</dt>
      <dd>{paper.arxiv_id ? <ArxivLink id={paper.arxiv_id} /> : "(none)"}</dd>
      <dt className="text-litera-mute">PDF</dt>
      <dd className="font-mono break-all flex items-start gap-1">
        {paper.pdf_path ? <><FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{paper.pdf_path}</> : "(none)"}
      </dd>
    </dl>
  );
}

function ArxivLink({ id }: { id: string }) {
  return (
    <a
      href={`https://arxiv.org/abs/${id}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-1"
    >
      {id}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{title}</h3>
      <p className={"text-sm leading-relaxed whitespace-pre-wrap " + (accent ? "text-litera-accent" : "text-litera-text")}>
        {body}
      </p>
    </section>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="text-sm text-red-400/90">✕ 翻译失败: {message}</div>;
}
