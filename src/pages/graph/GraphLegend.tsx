import { useT } from "@/i18n/I18nProvider";

const RELATION_COLORS: Record<string, string> = {
  extends: "border-violet-400",
  contradicts: "border-red-400",
  compares: "border-amber-400",
  builds_on: "border-sky-400",
  uses_method: "border-teal-400",
  related: "border-gray-400",
  has_concept: "border-emerald-300",
  discusses: "border-emerald-300",
  replaces: "border-pink-400",
  extends_concept: "border-purple-400",
  requires: "border-orange-400",
  enables: "border-green-400",
  competes_with: "border-red-500",
};

export function GraphLegend() {
  const t = useT();
  return (
    <div className="absolute bottom-3 left-3 rounded-lg border border-litera-line bg-litera-paper/90 px-3 py-2 text-xs space-y-1.5 backdrop-blur-sm shadow-sm">
      <div className="font-medium text-litera-text/70">Legend</div>
      <div className="flex items-center gap-2">
        {/* Paper: small rounded rect */}
        <span className="h-2 w-2.5 rounded-[2px] bg-indigo-500" />
        <span className="text-litera-mute">{t("graph.paperNodes")}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Concept: small hexagon via clip-path */}
        <span
          className="h-2.5 w-2.5 bg-emerald-500"
          style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
        />
        <span className="text-litera-mute">{t("graph.concepts")}</span>
      </div>
      <div className="border-t border-litera-line pt-1.5 space-y-1">
        {Object.entries(RELATION_COLORS).map(([rel, cls]) => (
          <div key={rel} className="flex items-center gap-2">
            <span className={`h-0.5 w-4 border-t-2 ${cls}`} />
            <span className="text-litera-mute">{t(`relation.${rel}` as any)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
