import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type Highlight, type ResearchProject } from "@/lib/api";
import { errorMessage } from "@/lib/error";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { MIN_SUMMARY_CHARS } from "../HighlightList";
import { ActionRow } from "./HighlightRowActions";
import {
  ErrorText,
  ExplanationBlock,
  MetaTextBlock,
  NoteBlock,
  NoteEditor,
  OriginalBlock,
  TranslationIcon,
} from "./HighlightRowBlocks";
import { countChars, hasCondensedAction, hasCondensedContent } from "./highlightRowUtils";

const HIGHLIGHT_TYPES = [
  "background",
  "motivation",
  "method",
  "dataset",
  "result",
  "limitation",
  "comparison",
  "quote",
  "question",
] as const;

export function HighlightRow({
  highlight,
  onJump,
  onRefresh,
}: {
  highlight: Highlight;
  onJump: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(!hasCondensedContent(highlight));
  const [draftNote, setDraftNote] = useState(highlight.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [projectId, setProjectId] = useState<number | "">("");
  const [evidenceAdded, setEvidenceAdded] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
  });
  const saveNote = useMutation({
    mutationFn: (note: string) => api.highlightUpdateNote(highlight.id, note || null),
    onSuccess: async () => {
      setEditing(false);
      await onRefresh();
    },
  });
  const translate = useMutation({
    mutationFn: () => api.highlightTranslate(highlight.id),
    onSuccess: async () => {
      setShowOriginal(false);
      await onRefresh();
    },
  });
  const summarize = useMutation({
    mutationFn: () => api.highlightSummarize(highlight.id),
    onSuccess: async () => {
      setShowOriginal(false);
      await onRefresh();
    },
  });
  const explain = useMutation({
    mutationFn: () => api.highlightExplain(highlight.id),
    onSuccess: async () => {
      setShowOriginal(false);
      await onRefresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.highlightDelete(highlight.id),
    onSuccess: onRefresh,
  });
  const updateType = useMutation({
    mutationFn: (label: string | null) => api.highlightUpdateLabel(highlight.id, label),
    onSuccess: onRefresh,
  });
  const addEvidence = useMutation({
    mutationFn: () => {
      if (projectId === "") throw new Error("Project is required");
      return api.evidenceAddFromHighlight(projectId, highlight.id);
    },
    onSuccess: () => setEvidenceAdded(true),
  });
  const canSummarize = countChars(highlight.text) >= MIN_SUMMARY_CHARS;

  useEffect(() => {
    setDraftNote(highlight.note ?? "");
  }, [highlight.note]);

  useEffect(() => {
    if (highlight.summary_text || highlight.translation_text || highlight.explanation_text) {
      setShowOriginal(false);
    }
  }, [highlight.summary_text, highlight.translation_text, highlight.explanation_text]);

  return (
    <li className="group px-3 py-2.5 hover:bg-litera-panel/40 transition-colors">
      <button onClick={onJump} className="w-full text-left">
        <div className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">
          {t("reader.page", { page: highlight.page })}
        </div>
        {highlight.summary_text && (
          <MetaTextBlock
            label={t("reader.summarizeLabel")}
            model={highlight.summary_model}
            text={highlight.summary_text}
          />
        )}
        {highlight.translation_text && (
          <MetaTextBlock
            label={highlight.translation_target_lang ?? t("reader.translateLabel")}
            model={highlight.translation_model}
            text={highlight.translation_text}
            icon={<TranslationIcon />}
          />
        )}
        {highlight.explanation_text && (
          <ExplanationBlock
            model={highlight.explanation_model}
            text={highlight.explanation_text}
          />
        )}
        {(!hasCondensedContent(highlight) || showOriginal) && (
          <OriginalBlock text={highlight.text} />
        )}
      </button>
      {confirming ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span className="text-red-400/90">{t("reader.confirmDelete")}</span>
          <button
            onClick={() => { remove.mutate(); setConfirming(false); }}
            className="litera-btn-primary text-[10px] px-2 py-0.5"
          >
            {t("reader.confirm")}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="litera-btn text-[10px] px-2 py-0.5"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <div
          className="opacity-0 group-hover:opacity-100 transition-all duration-150 translate-y-0.5 group-hover:translate-y-0"
          style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
        >
          <ActionRow
            canSummarize={canSummarize}
            editing={editing}
            hasCondensed={hasCondensedAction(highlight)}
            hasExplanation={!!highlight.explanation_text}
            hasSummary={!!highlight.summary_text}
            hasTranslation={!!highlight.translation_text}
            isDeleting={remove.isPending}
            isExplaining={explain.isPending}
            isSummarizing={summarize.isPending}
            isTranslating={translate.isPending}
            showOriginal={showOriginal}
            onDelete={() => setConfirming(true)}
            onEditNote={() => {
              setEditing(true);
              setDraftNote(highlight.note ?? "");
            }}
            onExplain={() => explain.mutate()}
            onSummarize={() => summarize.mutate()}
            onToggleOriginal={() => setShowOriginal((value) => !value)}
            onTranslate={() => translate.mutate()}
          />
        </div>
      )}
      {highlight.note && !editing && <NoteBlock note={highlight.note} />}
      <HighlightTypeRow
        highlight={highlight}
        isSaving={updateType.isPending}
        onChange={(label) => updateType.mutate(label)}
      />
      <EvidenceTargetRow
        projects={projects.data ?? []}
        projectId={projectId}
        isSaving={addEvidence.isPending}
        added={evidenceAdded}
        onProjectChange={setProjectId}
        onAdd={() => addEvidence.mutate()}
      />
      {editing && (
        <NoteEditor
          draftNote={draftNote}
          isSaving={saveNote.isPending}
          onCancel={() => {
            setEditing(false);
            setDraftNote(highlight.note ?? "");
          }}
          onChange={setDraftNote}
          onSave={() => saveNote.mutate(draftNote)}
        />
      )}
      {summarize.error && (
        <ErrorText message={errorMessage(summarize.error)} />
      )}
      {translate.error && (
        <ErrorText message={errorMessage(translate.error)} />
      )}
      {explain.error && (
        <ErrorText message={errorMessage(explain.error)} />
      )}
      {updateType.error && (
        <ErrorText message={errorMessage(updateType.error)} />
      )}
      {addEvidence.error && (
        <ErrorText message={errorMessage(addEvidence.error)} />
      )}
    </li>
  );
}

function HighlightTypeRow({
  highlight,
  isSaving,
  onChange,
}: {
  highlight: Highlight;
  isSaving: boolean;
  onChange: (label: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-litera-mute">
      <span>{t("reader.highlightType")}</span>
      <select
        value={highlight.label ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={isSaving}
        className="litera-input py-0.5 text-[11px]"
      >
        <option value="">{t("reader.highlightType.none")}</option>
        {HIGHLIGHT_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`reader.highlightType.${type}` as TKey)}
          </option>
        ))}
      </select>
    </div>
  );
}

function EvidenceTargetRow({
  projects,
  projectId,
  isSaving,
  added,
  onProjectChange,
  onAdd,
}: {
  projects: ResearchProject[];
  projectId: number | "";
  isSaving: boolean;
  added: boolean;
  onProjectChange: (id: number | "") => void;
  onAdd: () => void;
}) {
  const t = useT();
  if (projects.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-litera-mute">
      <span>{t("reader.evidenceProject")}</span>
      <select
        value={projectId}
        onChange={(event) => onProjectChange(event.target.value ? Number(event.target.value) : "")}
        className="litera-input py-0.5 text-[11px] min-w-0 flex-1"
      >
        <option value="">{t("common.none")}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
      <button
        onClick={onAdd}
        disabled={isSaving || projectId === ""}
        className="litera-btn text-[11px] px-2 py-0.5 disabled:opacity-50"
      >
        {t("reader.addEvidence")}
      </button>
      {added && <span className="text-emerald-400">{t("reader.evidenceAdded")}</span>}
    </div>
  );
}
