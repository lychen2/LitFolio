import { memo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BookOpen, Circle, CircleCheck, CircleDot, FileText, Languages, Loader2,
  Plus, Sparkles, Star, Tag as TagIcon, X,
} from "lucide-react";
import { api, type Paper, type ReadStatus, type Tag } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { FolderPicker } from "./FolderPicker";
import { PaperActions } from "./PaperActions";
import { usePaperActions } from "./usePaperActions";

const STATUS_META: Record<ReadStatus, { labelKey: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  unread: { labelKey: "common.unread", icon: Circle, tone: "text-litera-mute" },
  reading: { labelKey: "common.reading", icon: CircleDot, tone: "text-litera-accent2" },
  read: { labelKey: "common.read", icon: CircleCheck, tone: "text-emerald-400" },
  must: { labelKey: "library.mustRead", icon: Star, tone: "text-amber-400" },
};

const STATUS_ORDER: ReadStatus[] = ["unread", "reading", "read", "must"];

export function VirtualPaperList({
  papers, tagsByPaper, onInspect, onQuickRead,
}: {
  papers: Paper[];
  tagsByPaper: Record<string, Tag[]>;
  onInspect: (p: Paper) => void;
  onQuickRead: (p: Paper) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: papers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 90,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <PaperRow
              p={papers[vi.index]}
              tags={tagsByPaper[papers[vi.index].id] ?? []}
              onInspect={onInspect}
              onQuickRead={onQuickRead}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const PaperRow = memo(function PaperRow({
  p, tags, onInspect, onQuickRead,
}: {
  p: Paper;
  tags: Tag[];
  onInspect: (p: Paper) => void;
  onQuickRead: (p: Paper) => void;
}) {
  const { t } = useI18n();
  const actions = usePaperActions(p);
  const { rowRef, tldr, translate, attachPdf, del, openMut } = actions;

  return (
    <li ref={rowRef} className="px-6 py-2.5 hover:bg-litera-panel/50 transition-colors group">
      <div className="flex items-start gap-3">
        <StatusToggle paper={p} />
        <FileText className="h-4 w-4 mt-1 text-litera-mute shrink-0" />
        <div className="min-w-0 flex-1">
          <button onClick={() => onInspect(p)} className="font-medium text-litera-text leading-snug text-left hover:text-litera-accent">
            {p.title}
          </button>
          {p.title_translated && (
            <div className="text-xs text-litera-accent/90 mt-0.5 italic flex items-start gap-1.5">
              <Languages className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{p.title_translated}</span>
            </div>
          )}
          <PaperMeta p={p} />
          {p.tldr && <TldrPreview text={p.tldr} />}
          {p.key_findings.length > 0 && <FindingPreview findings={p.key_findings} />}
          {(p.research_question || p.method) && <DeepReadMarker />}
          <TagChipsRow paperId={p.id} tags={tags} />
          <FolderPicker paperId={p.id} />
        </div>
        <PaperActions p={p} actions={actions} onQuickRead={onQuickRead} />
      </div>
      <RowErrors errors={[
        tldr.error && (tldr.error as Error).message,
        translate.error && `${t("library.translateFailed")}${(translate.error as Error).message}`,
        attachPdf.error && `${t("library.attachPdfFailed")}${(attachPdf.error as Error).message}`,
        del.error && `${t("library.deleteFailed")}${(del.error as Error).message}`,
        openMut.error && `${t("library.openFailed")}${(openMut.error as Error).message}`,
      ]} />
    </li>
  );
});

function PaperMeta({ p }: { p: Paper }) {
  const { t } = useI18n();
  return (
    <div className="text-xs text-litera-mute mt-0.5 flex items-center gap-2 flex-wrap">
      {p.authors.length > 0 && (
        <span className="truncate max-w-[420px]">
          {p.authors.slice(0, 3).join(", ")}{p.authors.length > 3 ? " et al." : ""}
        </span>
      )}
      {p.year && <span>· {p.year}</span>}
      {p.venue && <span className="truncate">· {p.venue}</span>}
      {p.doi && <span className="font-mono">· {p.doi}</span>}
      {p.arxiv_id && <span className="font-mono">· arXiv:{p.arxiv_id}</span>}
      {!p.pdf_path && <span className="text-amber-400/80">· {t("library.noPdf")}</span>}
    </div>
  );
}

function TldrPreview({ text }: { text: string }) {
  return (
    <div className="text-xs text-litera-text/80 mt-1.5 leading-relaxed flex items-start gap-1.5">
      <Sparkles className="h-3.5 w-3.5 mt-0.5 text-litera-accent shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function FindingPreview({ findings }: { findings: string[] }) {
  return (
    <ul className="mt-1.5 text-xs text-litera-text/70 ml-5 list-disc space-y-0.5">
      {findings.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
    </ul>
  );
}

function DeepReadMarker() {
  const { t } = useI18n();
  return (
    <div className="mt-1.5 text-[11px] flex items-center gap-2 text-litera-accent2">
      <BookOpen className="h-3 w-3" /> {t("library.hasDeepRead")}
    </div>
  );
}

function RowErrors({ errors }: { errors: Array<string | false | null> }) {
  return errors.filter(Boolean).map((error) => (
    <div key={String(error)} className="ml-7 mt-1 text-xs text-red-400/90">✕ {error}</div>
  ));
}

function StatusToggle({ paper }: { paper: Paper }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const m = useMutation({
    mutationFn: (next: ReadStatus) => api.paperSetReadStatus(paper.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"], refetchType: "active" }),
  });
  const meta = STATUS_META[paper.read_status];
  const Icon = meta.icon;
  function cycle() {
    const idx = STATUS_ORDER.indexOf(paper.read_status);
    m.mutate(STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]);
  }
  return (
    <button
      onClick={cycle}
      disabled={m.isPending}
      className={"mt-0.5 shrink-0 p-0.5 rounded hover:bg-litera-panel transition-colors " + meta.tone}
      title={t("library.statusToggle", { status: t(meta.labelKey as Parameters<typeof t>[0]) })}
      aria-label={t("library.statusToggle", { status: t(meta.labelKey as Parameters<typeof t>[0]) })}
    >
      {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  );
}

function TagChipsRow({ paperId, tags }: { paperId: string; tags: Tag[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const detach = useMutation({
    mutationFn: (tagId: number) => api.paperDetachTag(paperId, tagId),
    onSuccess: () => invalidateTags(qc, paperId),
  });
  const create = useMutation({
    mutationFn: async (n: string) => attachNamedTag(paperId, n),
    onSuccess: () => {
      setName("");
      setAdding(false);
      invalidateTags(qc, paperId);
    },
  });
  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => <TagChip key={tag.id} tag={tag} onRemove={() => detach.mutate(tag.id)} />)}
      {adding ? (
        <TagInput name={name} setName={setName} create={create} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-litera-mute border border-dashed border-litera-line hover:text-litera-text hover:border-litera-mute"
        >
          <Plus className="h-2.5 w-2.5" /> tag
        </button>
      )}
    </div>
  );
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>, paperId: string) {
  qc.invalidateQueries({ queryKey: ["paper-tags", paperId] });
  qc.invalidateQueries({ queryKey: ["tags-list"] });
}

async function attachNamedTag(paperId: string, name: string) {
  const existing = (await api.tagsList()).find((t) => t.name.toLowerCase() === name.toLowerCase());
  const id = existing?.id ?? (await api.tagCreate(name)).id;
  await api.paperAttachTag(paperId, id);
  return id;
}

function TagChip({ tag, onRemove }: { tag: Tag; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border" style={tagStyle(tag.color)}>
      <TagIcon className="h-2.5 w-2.5" />
      {tag.name}
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 ml-0.5">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function tagStyle(color: string | null) {
  return {
    borderColor: color ?? "color-mix(in srgb, var(--litera-accent) 40%, transparent)",
    color: color ?? "var(--litera-accent)",
    backgroundColor: color ?? "color-mix(in srgb, var(--litera-accent) 10%, transparent)",
  };
}

function TagInput({
  name, setName, create, onCancel,
}: {
  name: string;
  setName: (name: string) => void;
  create: ReturnType<typeof useMutation<number, Error, string>>;
  onCancel: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => handleTagInputKey(e, name, create, onCancel, setName)}
        placeholder="tag…"
        className="litera-input py-0.5 text-[11px] w-32"
      />
      <button onClick={() => name.trim() && create.mutate(name.trim())} className="text-litera-mute hover:text-litera-text">
        {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </button>
    </span>
  );
}

function handleTagInputKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  name: string,
  create: ReturnType<typeof useMutation<number, Error, string>>,
  onCancel: () => void,
  setName: (name: string) => void,
) {
  if (e.key === "Enter" && name.trim()) {
    create.mutate(name.trim());
  } else if (e.key === "Escape") {
    onCancel();
    setName("");
  }
}
