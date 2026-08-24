import { Network, Map, Loader2, Sparkles, Plus, Lightbulb } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/I18nProvider";

const RELATIONS = ["extends", "contradicts", "compares", "builds_on", "uses_method", "related"] as const;

interface Props {
  viewMode: "network" | "mindmap";
  onViewModeChange: (m: "network" | "mindmap") => void;
  includeConcepts: boolean;
  onIncludeConceptsChange: (v: boolean) => void;
  activeRelations: string[];
  onRelationToggle: (r: string) => void;
  onAiDiscover: () => void;
  onAddLink: () => void;
  onExtractConcepts: () => void;
  aiRunning: boolean;
  extractingConcepts: boolean;
}

export function GraphToolbar({
  viewMode, onViewModeChange,
  includeConcepts, onIncludeConceptsChange,
  activeRelations, onRelationToggle,
  onAiDiscover, onAddLink, onExtractConcepts,
  aiRunning, extractingConcepts,
}: Props) {
  const t = useT();
  return (
    <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-b border-litera-border bg-litera-paper/55 px-4 py-2">
      {/* View mode toggle */}
      <div className="flex shrink-0 overflow-hidden rounded-[var(--litera-radius)] border border-litera-border">
        {(["network", "mindmap"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onViewModeChange(m)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
              viewMode === m
                ? "bg-litera-accent text-litera-ink"
                : "text-litera-mute hover:bg-litera-surface2",
            )}
          >
            {m === "network" ? <Network className="h-3.5 w-3.5" /> : <Map className="h-3.5 w-3.5" />}
            {m === "network" ? t("graph.viewNetwork") : t("graph.viewMindmap")}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-litera-border" />

      {/* Relation filters */}
      <div className="flex shrink-0 items-center gap-1">
        {RELATIONS.map((r) => (
          <button
            key={r}
            onClick={() => onRelationToggle(r)}
            className={clsx(
              "px-2 py-0.5 rounded-full text-[11px] border transition-colors",
              activeRelations.includes(r)
                ? "border-litera-accent bg-litera-accent/10 text-litera-accent"
                : "border-litera-line text-litera-mute hover:border-litera-text/30",
            )}
          >
            {t(`relation.${r}` as any)}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-litera-border" />

      {/* Concept toggle */}
      <label className="flex items-center gap-1.5 text-xs text-litera-mute cursor-pointer">
        <input
          type="checkbox"
          checked={includeConcepts}
          onChange={(e) => onIncludeConceptsChange(e.target.checked)}
          className="accent-litera-accent"
        />
        {t("graph.includeConcepts")}
      </label>

      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onAddLink}
        className="litera-btn shrink-0 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("graph.addLink")}
      </button>
      <button
        onClick={onAiDiscover}
        disabled={aiRunning}
        className="litera-btn-primary shrink-0 text-xs disabled:opacity-50"
      >
        {aiRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {aiRunning ? t("graph.aiDiscovering") : t("graph.aiDiscover")}
      </button>
      <button
        onClick={onExtractConcepts}
        disabled={extractingConcepts}
        className="litera-btn shrink-0 text-xs disabled:opacity-50"
      >
        {extractingConcepts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
        {extractingConcepts ? t("concepts.extracting") : t("concepts.extract")}
      </button>
    </div>
  );
}
