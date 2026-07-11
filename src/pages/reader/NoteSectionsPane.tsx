import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, NotebookPen, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { api, type NoteSection } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { nextSectionDraft } from "./noteSectionState";
import type { TKey } from "@/i18n/dict";

const SECTION_META: Record<string, { icon: string; labelKey: TKey; placeholderKey: TKey }> = {
  problem: {
    icon: "❓",
    labelKey: "reader.card.problem",
    placeholderKey: "reader.card.problemPlaceholder",
  },
  method: {
    icon: "⚙️",
    labelKey: "reader.card.method",
    placeholderKey: "reader.card.methodPlaceholder",
  },
  key_findings: {
    icon: "✦",
    labelKey: "reader.card.keyFindings",
    placeholderKey: "reader.card.keyFindingsPlaceholder",
  },
  evidence: {
    icon: "§",
    labelKey: "reader.card.evidence",
    placeholderKey: "reader.card.evidencePlaceholder",
  },
  limitations: {
    icon: "⚠️",
    labelKey: "reader.card.limitations",
    placeholderKey: "reader.card.limitationsPlaceholder",
  },
  datasets: {
    icon: "▦",
    labelKey: "reader.card.datasets",
    placeholderKey: "reader.card.datasetsPlaceholder",
  },
  metrics: {
    icon: "#",
    labelKey: "reader.card.metrics",
    placeholderKey: "reader.card.metricsPlaceholder",
  },
  project_relation: {
    icon: "↗",
    labelKey: "reader.card.projectRelation",
    placeholderKey: "reader.card.projectRelationPlaceholder",
  },
  quotes: {
    icon: "“”",
    labelKey: "reader.card.quotes",
    placeholderKey: "reader.card.quotesPlaceholder",
  },
  open_questions: {
    icon: "?",
    labelKey: "reader.card.openQuestions",
    placeholderKey: "reader.card.openQuestionsPlaceholder",
  },
  numbers: {
    icon: "#",
    labelKey: "reader.card.metrics",
    placeholderKey: "reader.card.metricsPlaceholder",
  },
  limits: {
    icon: "⚠️",
    labelKey: "reader.card.limitations",
    placeholderKey: "reader.card.limitationsPlaceholder",
  },
  thoughts: {
    icon: "↗",
    labelKey: "reader.card.projectRelation",
    placeholderKey: "reader.card.projectRelationPlaceholder",
  },
};

export function NoteSectionsPane({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: sections, isLoading } = useQuery({
    queryKey: ["noteSections", paperId],
    queryFn: () => api.noteSectionsGet(paperId),
    refetchOnWindowFocus: false,
  });

  const saveMut = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      api.noteSectionsSave(paperId, key, content, "user"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["noteSections", paperId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.noteSectionDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["noteSections", paperId] }),
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-litera-mute" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-litera-paper/30">
      <div className="px-3 py-2 border-b border-litera-line flex items-center gap-1.5">
        <NotebookPen className="h-3.5 w-3.5 text-litera-mute" />
        <span className="text-xs uppercase tracking-wider text-litera-mute">{t("reader.tabNotes")}</span>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {sections?.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            collapsed={collapsed.has(s.section_key)}
            onToggle={() => toggleCollapse(s.section_key)}
            onSave={(content) => saveMut.mutate({ key: s.section_key, content })}
            onDelete={() => deleteMut.mutate(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  collapsed,
  onToggle,
  onSave,
  onDelete,
}: {
  section: NoteSection;
  collapsed: boolean;
  onToggle: () => void;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(section.content);
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  // Sync draft when section content changes externally (e.g. AI fill).
  useEffect(() => {
    setDraft((currentDraft) => nextSectionDraft({
      currentDraft,
      incomingContent: section.content,
      dirty,
    }));
  }, [section.content, dirty]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onSave(draft);
      setDirty(false);
    }, 1000);
    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [draft, dirty, onSave]);

  const t = useT();
  const meta = SECTION_META[section.section_key];
  const icon = meta?.icon ?? "📝";
  const label = meta ? t(meta.labelKey) : section.section_key;
  const placeholder = meta ? t(meta.placeholderKey) : t("reader.card.defaultPlaceholder");
  const sourceBadge =
    section.source === "user" ? null : (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-litera-accent/10 text-litera-accent">
        {section.source.replace("ai:", "AI: ")}
      </span>
    );

  return (
    <div className="border border-litera-line rounded-lg bg-litera-paper overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-litera-panel/50 transition-colors"
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-litera-mute" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-litera-mute" />
        )}
        <span className="text-sm">{icon}</span>
        <span className="text-sm font-medium text-litera-text flex-1">{label}</span>
        {sourceBadge}
        {dirty && <span className="text-[10px] text-amber-400">●</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-litera-mute hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {!collapsed && (
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          spellCheck={false}
          placeholder={placeholder}
          className="w-full min-h-[80px] px-3 py-2 text-sm bg-transparent border-0 outline-none resize-y text-litera-text placeholder:text-litera-mute"
        />
      )}
    </div>
  );
}
