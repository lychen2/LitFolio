import { useT } from "@/i18n/I18nProvider";

const RELATION_COLORS: Record<string, string> = {
  citation: "border-litera-info",
  similar: "border-litera-accent",
  manual: "border-litera-warn",
  concept: "border-litera-success",
};

export function GraphLegend() {
  const t = useT();
  return (
    <div className="absolute bottom-3 left-3 space-y-1.5 rounded-[var(--litera-radius)] border border-litera-border bg-litera-paper/95 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-litera-text/70">{t("graph.legend")}</div>
      <div className="flex items-center gap-2">
        {/* Paper: small rounded rect */}
        <span className="h-2 w-2.5 rounded-[2px] bg-litera-accent" />
        <span className="text-litera-mute">{t("graph.paperNodes")}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Concept: small hexagon via clip-path */}
        <span
          className="h-2.5 w-2.5 bg-litera-info"
          style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
        />
        <span className="text-litera-mute">{t("graph.concepts")}</span>
      </div>
      <div className="border-t border-litera-line pt-1.5 space-y-1">
        {Object.entries(RELATION_COLORS).map(([rel, cls]) => (
          <div key={rel} className="flex items-center gap-2">
            <span className={`h-0.5 w-4 border-t-2 ${cls}`} />
            <span className="text-litera-mute">{t(`graph.edge.${rel}` as any)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
