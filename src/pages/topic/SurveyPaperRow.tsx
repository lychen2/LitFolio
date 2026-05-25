import { Star, Download, ExternalLink, Sparkles } from "lucide-react";
import type { SurveyPaper } from "@/lib/api";

interface Props {
  paper: SurveyPaper;
  rank: number;
}

export function SurveyPaperRow({ paper, rank }: Props) {
  const cc = paper.citation_count;
  const icc = paper.influential_citation_count;
  return (
    <li
      id={`paper-${paper.id}`}
      className="px-4 py-3.5 hover:bg-litera-panel/40 transition-colors scroll-mt-4 rounded-sm"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 text-right">
          <div className="font-mono text-xs tabular-nums text-litera-mute">#{rank}</div>
          {paper.must_read && (
            <Star className="h-4 w-4 mt-1 text-amber-400 fill-amber-400 inline" aria-label="必读" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">{paper.title}</div>
          <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate max-w-[440px]">
              {paper.authors.slice(0, 3).join(", ")}
              {paper.authors.length > 3 ? " et al." : ""}
            </span>
            {paper.year != null && <span>· {paper.year}</span>}
            {paper.venue && <span className="truncate">· {paper.venue}</span>}
          </div>
          {paper.why_important && (
            <p className="mt-2 text-xs text-litera-accent2 italic border-l-2 border-litera-accent2/40 pl-2.5 leading-relaxed">
              <Sparkles className="inline h-3 w-3 mr-1 -mt-0.5" />
              {paper.why_important}
            </p>
          )}
          {!paper.why_important && paper.abstract_text && (
            <p className="mt-2 text-xs text-litera-text/70 line-clamp-2 leading-relaxed">
              {paper.abstract_text}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
            {cc != null && <CiteStat label="cites" value={cc.toLocaleString()} />}
            {icc != null && <CiteStat label="influential" value={icc.toLocaleString()} dim />}
            {paper.doi && (
              <ExtLink href={`https://doi.org/${paper.doi}`} label="doi" text={paper.doi} />
            )}
            {paper.arxiv_id && (
              <ExtLink href={`https://arxiv.org/abs/${paper.arxiv_id}`} label="arXiv" text={paper.arxiv_id} />
            )}
          </div>
        </div>
        <div className="shrink-0">
          <button
            disabled
            title="入库需要 Unpaywall 集成获取 PDF 直链(见 STATUS §4 Phase 2,目前不可用)"
            className="litera-btn text-xs whitespace-nowrap opacity-40 cursor-not-allowed inline-flex items-center gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            入库
          </button>
        </div>
      </div>
    </li>
  );
}

function CiteStat({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border " +
      (dim
        ? "border-litera-line text-litera-mute"
        : "border-litera-accent/30 bg-litera-accent/10 text-litera-accent")
    }>
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-litera-mute">{label}</span>
    </span>
  );
}

function ExtLink({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-litera-mute hover:text-litera-accent2 inline-flex items-center gap-0.5"
    >
      {label}:{text}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}
