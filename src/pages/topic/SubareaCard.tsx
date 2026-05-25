import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpenText } from "lucide-react";
import type { SurveySubareaResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { SurveyPaperRow } from "./SurveyPaperRow";

interface Props {
  subarea: SurveySubareaResult;
  initialOpen?: boolean;
}

export function SubareaCard({ subarea, initialOpen = true }: Props) {
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  const year = subarea.year_range
    ? `${subarea.year_range[0]}–${subarea.year_range[1]}`
    : t("topic.survey.noYearLimit");
  const mustCount = subarea.papers.filter((p) => p.must_read).length;

  return (
    <article
      id={`subarea-${slugify(subarea.name)}`}
      className="litera-panel overflow-hidden"
    >
      <header
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-litera-panel/60"
        onClick={() => setOpen(!open)}
        role="button"
        aria-expanded={open}
      >
        <span className="text-litera-mute">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <BookOpenText className="h-4 w-4 text-litera-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg leading-tight text-litera-text">{subarea.name}</h3>
          <div className="text-xs text-litera-mute mt-0.5 flex gap-3 flex-wrap">
            <span>📅 {year}</span>
            <span>📚 {t("topic.survey.paperCount", { count: subarea.papers.length })}</span>
            {mustCount > 0 && (
              <span className="text-amber-400">⭐ {t("topic.survey.mustReadCount", { count: mustCount })}</span>
            )}
          </div>
        </div>
      </header>
      {open && (
        <div className="border-t border-litera-line/40">
          <div className="px-5 py-3 text-sm text-litera-text/85 leading-relaxed">
            {subarea.summary}
          </div>
          {subarea.search_terms.length > 0 && (
            <div className="px-5 pb-3 flex gap-1.5 flex-wrap text-[11px] items-center">
              <span className="text-litera-mute">{t("topic.survey.searchTerms")}</span>
              {subarea.search_terms.map((term) => (
                <span
                  key={term}
                  className="font-mono px-1.5 py-0.5 rounded border border-litera-line text-litera-text/70 bg-litera-paper"
                >
                  {term}
                </span>
              ))}
            </div>
          )}
          {subarea.papers.length === 0 ? (
            <div className="px-5 py-6 text-sm text-litera-mute italic border-t border-litera-line/40">
              {t("topic.survey.noPapers")}
            </div>
          ) : (
            <ul className="divide-y divide-litera-line/40 border-t border-litera-line/40">
              {subarea.papers.map((p, i) => (
                <SurveyPaperRow key={p.id} paper={p} rank={i + 1} />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
