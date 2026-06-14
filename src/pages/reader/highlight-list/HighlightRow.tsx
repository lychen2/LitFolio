import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type Highlight, type ResearchProject } from "@/lib/api";
import { errorMessage } from "@/lib/error";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { MIN_SUMMARY_CHARS } from "../HighlightList";
import {
  HIGHLIGHT_TYPES,
  highlightStyleVars,
  highlightTypeKey,
} from "../highlightTypes";
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
import {
  countChars,
  hasCondensedAction,
  hasCondensedContent,
} from "./highlightRowUtils";

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
  const [showOriginal, setShowOriginal] = useState(
    !hasCondensedContent(highlight)
  );
  const [draftNote, setDraftNote] = useState(highlight.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [projectId, setProjectId] = useState<number | "">("");
  const [evidenceAdded, setEvidenceAdded] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
  });
  const saveNote = useMutation({
    mutationFn: (note: string) =>
      api.highlightUpdateNote(highlight.id, note || null),
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
    mutationFn: (label: string | null) =>
      api.highlightUpdateLabel(highlight.id, label),
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
  const typeKey = highlightTypeKey(highlight.label);
  const typeLabel =
    typeKey === "default"
      ? t("reader.highlightType.none")
      : t(`reader.highlightType.${typeKey}` as TKey);

  useEffect(() => {
    setDraftNote(highlight.note ?? "");
  }, [highlight.note]);

  useEffect(() => {
    if (
      highlight.summary_text ||
      highlight.translation_text ||
      highlight.explanation_text
    ) {
      setShowOriginal(false);
    }
  }, [
    highlight.summary_text,
    highlight.translation_text,
    highlight.explanation_text,
  ]);

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        onJump();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        onJump();
      }}
      className="group cursor-pointer px-2.5 py-2 transition-colors hover:bg-[var(--litera-highlight-soft)]"
      style={highlightStyleVars(highlight.label)}
    >
      <div className="w-full text-left">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px]">
          <span className="uppercase tracking-wider text-litera-mute">
            {t("reader.page", { page: highlight.page })}
          </span>
          <span className="inline-flex items-center rounded-full bg-[var(--litera-highlight-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--litera-highlight-fg)] ring-1 ring-inset ring-[var(--litera-highlight-ring)]">
            {typeLabel}
          </span>
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
            label={
              highlight.translation_target_lang ?? t("reader.translateLabel")
            }
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
      </div>
      {confirming ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span className="text-red-400/90">{t("reader.confirmDelete")}</span>
          <button
            onClick={() => {
              remove.mutate();
              setConfirming(false);
            }}
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
      <HighlightMetaRow
        highlight={highlight}
        projects={projects.data ?? []}
        projectId={projectId}
        isTypeSaving={updateType.isPending}
        isEvidenceSaving={addEvidence.isPending}
        evidenceAdded={evidenceAdded}
        onTypeChange={(label) => updateType.mutate(label)}
        onProjectChange={setProjectId}
        onAddEvidence={() => addEvidence.mutate()}
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
      {summarize.error && <ErrorText message={errorMessage(summarize.error)} />}
      {translate.error && <ErrorText message={errorMessage(translate.error)} />}
      {explain.error && <ErrorText message={errorMessage(explain.error)} />}
      {updateType.error && (
        <ErrorText message={errorMessage(updateType.error)} />
      )}
      {addEvidence.error && (
        <ErrorText message={errorMessage(addEvidence.error)} />
      )}
    </li>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? !!target.closest("button, select, input, textarea, a")
    : false;
}

function HighlightMetaRow({
  highlight,
  projects,
  projectId,
  isTypeSaving,
  isEvidenceSaving,
  evidenceAdded,
  onTypeChange,
  onProjectChange,
  onAddEvidence,
}: {
  highlight: Highlight;
  projects: ResearchProject[];
  projectId: number | "";
  isTypeSaving: boolean;
  isEvidenceSaving: boolean;
  evidenceAdded: boolean;
  onTypeChange: (label: string | null) => void;
  onProjectChange: (id: number | "") => void;
  onAddEvidence: () => void;
}) {
  const t = useT();
  const hasProjects = projects.length > 0;

  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-litera-mute">
      <label className="flex min-w-0 flex-[0_1_10rem] items-center gap-1">
        <span className="shrink-0 uppercase tracking-wide">
          {t("reader.highlightType")}
        </span>
        <select
          value={highlight.label ?? ""}
          onChange={(event) => onTypeChange(event.target.value || null)}
          disabled={isTypeSaving}
          className="litera-input h-6 min-w-0 flex-1 px-1.5 py-0 text-[10px]"
        >
          <option value="">{t("reader.highlightType.none")}</option>
          {HIGHLIGHT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`reader.highlightType.${type}` as TKey)}
            </option>
          ))}
        </select>
      </label>
      {hasProjects ? (
        <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-1">
          <label className="flex min-w-0 flex-1 items-center gap-1">
            <span className="shrink-0 uppercase tracking-wide">
              {t("reader.evidenceProject")}
            </span>
            <select
              value={projectId}
              onChange={(event) =>
                onProjectChange(
                  event.target.value ? Number(event.target.value) : ""
                )
              }
              className="litera-input h-6 min-w-0 flex-1 px-1.5 py-0 text-[10px]"
            >
              <option value="">{t("common.none")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={onAddEvidence}
            disabled={isEvidenceSaving || projectId === ""}
            className="litera-btn h-6 shrink-0 px-1.5 py-0 text-[10px] disabled:opacity-50"
          >
            {t("reader.addEvidence")}
          </button>
        </div>
      ) : null}
      {evidenceAdded && hasProjects ? (
        <span className="text-[10px] text-litera-accent2">
          {t("reader.evidenceAdded")}
        </span>
      ) : null}
    </div>
  );
}
