import { useId, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight } from "@/components/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { formatMessage } from "@/i18n/format";
import { deriveCitationPerspectives } from "./citationPerspectiveData";
import type { CitationPerspectiveEntry } from "./citationPerspectiveData";
import { networkCopy } from "./copy";
import type { LiteratureNetwork, LiteratureNetworkNode } from "./network";
import "./CitationPerspectives.css";

const en = {
  prior: {
    title: "Prior works",
    count: "Cited by {count} papers in this graph",
    empty: "No work is cited by at least two papers in this graph.",
  },
  subsequent: {
    title: "Subsequent works",
    count: "Cites {count} papers in this graph",
    empty: "No work cites at least two papers in this graph.",
  },
  externalWork: "Outside this graph",
  viewWork: "View paper details",
  source: "OpenAlex record for {title}",
  evidence: {
    citation: "Direct citation",
    shared_reference: "Shared reference",
    co_citation: "Co-citation",
  },
};

const zh: typeof en = {
  prior: {
    title: "基础工作",
    count: "图内 {count} 篇论文引用",
    empty: "未发现被至少两篇图内论文引用的作品。",
  },
  subsequent: {
    title: "后续工作",
    count: "引用图内 {count} 篇论文",
    empty: "未发现引用至少两篇图内论文的作品。",
  },
  externalWork: "图外作品",
  viewWork: "查看论文详情",
  source: "{title} 的 OpenAlex 记录",
  evidence: {
    citation: "直接引文",
    shared_reference: "共同参考",
    co_citation: "共引",
  },
};

const perspectiveCopy = { en, zh };

interface CitationPerspectivesProps {
  result: LiteratureNetwork;
  onSelect: (node: LiteratureNetworkNode) => void;
}

export default function CitationPerspectives({ result, onSelect }: CitationPerspectivesProps) {
  const { lang } = useI18n();
  const copy = perspectiveCopy[lang];
  const id = useId();
  const perspectives = useMemo(() => deriveCitationPerspectives(result), [result]);

  return (
    <div className="citation-perspectives">
      {(["prior", "subsequent"] as const).map((perspective) => {
        const heading = `${id}-${perspective}`;
        const entries = perspectives[perspective];
        const labels = copy[perspective];
        return (
          <section key={perspective} className="litera-panel citation-perspectives__panel" aria-labelledby={heading}>
            <h2 id={heading} className="citation-perspectives__heading">{labels.title}</h2>
            {entries.length === 0 ? (
              <p className="citation-perspectives__empty">{labels.empty}</p>
            ) : (
              <ol className="citation-perspectives__entries" role="list">
                {entries.map((entry) => (
                  <li key={entry.work.id}>
                    <CitationEntry entry={entry} perspective={perspective} onSelect={onSelect} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CitationEntry({ entry: { work, matches }, perspective, onSelect }: {
  entry: CitationPerspectiveEntry;
  perspective: "prior" | "subsequent";
  onSelect: CitationPerspectivesProps["onSelect"];
}) {
  const { lang } = useI18n();
  const copy = perspectiveCopy[lang];
  const [openError, setOpenError] = useState(false);
  const node = work.node;

  function followExternal(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauri()) return;
    event.preventDefault();
    setOpenError(false);
    void openUrl(event.currentTarget.href).catch(() => setOpenError(true));
  }

  return (
    <details className="citation-perspectives__entry">
      <summary className="citation-perspectives__summary">
        <ChevronRight aria-hidden="true" />
        <span className="citation-perspectives__summary-text">
          <span className="citation-perspectives__title">{work.title}</span>
          <span className="citation-perspectives__count">
            {formatMessage(copy[perspective].count, { count: matches.length })}
            {!node && <> · {copy.externalWork}</>}
          </span>
        </span>
      </summary>
      <div className="citation-perspectives__detail">
        <div className="citation-perspectives__actions">
          {node && (
            <button type="button" className="citation-perspectives__action" onClick={() => onSelect(node)}>{copy.viewWork}</button>
          )}
          {work.url && (
            <a className="citation-perspectives__action" href={work.url} target="_blank" rel="noreferrer"
              aria-label={formatMessage(copy.source, { title: work.title })} onClick={followExternal}>OpenAlex</a>
          )}
        </div>
        {openError && <p className="citation-perspectives__error" role="alert">{networkCopy[lang].openLinkError}</p>}
        <ul className="citation-perspectives__matches" role="list">
          {matches.map((match) => (
            <li key={match.node.id} className="citation-perspectives__match">
              <div>
                <button type="button" className="citation-perspectives__action" onClick={() => onSelect(match.node)}>{match.node.title}</button>
                <span className="citation-perspectives__evidence">
                  {Array.from(match.evidenceKinds, (kind) => copy.evidence[kind]).join(" · ")}
                </span>
              </div>
              {perspective === "prior" && match.url && (
                <a className="citation-perspectives__action" href={match.url} target="_blank" rel="noreferrer"
                  aria-label={formatMessage(copy.source, { title: match.node.title })} onClick={followExternal}>OpenAlex</a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
