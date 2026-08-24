import { Star } from "lucide-react";
import type { SurveyPaper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

interface Props {
  papers: SurveyPaper[];
}

export function MustReadShortlist({ papers }: Props) {
  const t = useT();
  if (papers.length === 0) return null;
  return (
    <div className="litera-panel mb-4 px-4 py-3 bg-litera-warn/5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-litera-warn mb-2">
        <Star className="h-4 w-4 fill-litera-warn" />
        {t("topic.survey.mustRead", { count: papers.length })}
      </h3>
      <ol className="flex flex-wrap gap-2">
        {papers.map((p, i) => (
          <li key={p.id}>
            <button
              onClick={() => scrollToRow(p.id)}
              title={p.title}
              className="px-2 py-1 rounded border border-litera-warn/30 bg-litera-warn/5 text-xs text-litera-text hover:bg-litera-warn/15 transition-colors text-left max-w-[280px] truncate inline-flex items-center"
            >
              <span className="font-mono text-litera-warn mr-1.5">#{i + 1}</span>
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/// Smooth-scroll to the paper row and flash a highlight ring so the user can
/// orient — the must-read list is at the top of the long page and a silent
/// scroll loses the user's place.
function scrollToRow(id: string) {
  const el = document.getElementById(`paper-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-litera-warn");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-litera-warn"), 1500);
}
