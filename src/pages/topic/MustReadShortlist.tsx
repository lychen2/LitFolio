import { Star } from "lucide-react";
import type { SurveyPaper } from "@/lib/api";

interface Props {
  papers: SurveyPaper[];
}

export function MustReadShortlist({ papers }: Props) {
  if (papers.length === 0) return null;
  return (
    <div className="litera-panel mb-4 px-4 py-3 border-l-4 border-l-amber-400">
      <h3 className="flex items-center gap-2 text-sm font-medium text-amber-400 mb-2">
        <Star className="h-4 w-4 fill-amber-400" />
        必读 {papers.length} 篇
      </h3>
      <ol className="flex flex-wrap gap-2">
        {papers.map((p, i) => (
          <li key={p.id}>
            <button
              onClick={() => scrollToRow(p.id)}
              title={p.title}
              className="px-2 py-1 rounded border border-amber-400/30 bg-amber-400/5 text-xs text-litera-text hover:bg-amber-400/15 transition-colors text-left max-w-[280px] truncate inline-flex items-center"
            >
              <span className="font-mono text-amber-400/80 mr-1.5">#{i + 1}</span>
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
  el.classList.add("ring-2", "ring-amber-400");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
}
