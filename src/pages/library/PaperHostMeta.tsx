import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, CircleCheck, CircleDot, Loader2, Paperclip, Plus, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import { api, pickSinglePdf, type Paper, type ReadStatus } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { notifyLibraryChanged } from "@/lib/libraryRefresh";
import { FolderPicker } from "./FolderPicker";
import { updatePaperStatusCache } from "./paperStatusCache";
const STATUS_SEQUENCE: ReadStatus[] = ["unread", "reading", "read", "must"];

const STATUS_VIEW: Record<
  ReadStatus,
  { labelKey: "common.unread" | "common.reading" | "common.read" | "common.must"; icon: typeof Circle; tone: string }
> = {
  unread: { labelKey: "common.unread", icon: Circle, tone: "text-litera-mute" },
  reading: { labelKey: "common.reading", icon: CircleDot, tone: "text-litera-accent2" },
  read: { labelKey: "common.read", icon: CircleCheck, tone: "text-litera-success" },
  must: { labelKey: "common.must", icon: Star, tone: "text-litera-warn" },
};

/**
 * Paper metadata the retired LitFolio list carried on each row: read status,
 * tags, folders, the attached PDF and delete. The canonical upstream list owns
 * the row itself, so these live with the detail surface the host opens for one
 * paper and write through the same commands the old rows used.
 */
export function PaperHostMeta({ paper, onDeleted }: { paper: Paper; onDeleted: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = useMutation({
    mutationFn: (next: ReadStatus) => api.paperSetReadStatus(paper.id, next),
    onSuccess: (_result, next) => {
      updatePaperStatusCache(queryClient, paper.id, next);
      notifyLibraryChanged();
    },
  });
  const attach = useMutation({
    mutationFn: async () => {
      const source = await pickSinglePdf();
      if (!source) return null;
      return api.paperAttachPdf(paper.id, source);
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.invalidateQueries({ queryKey: ["papers"] });
      queryClient.invalidateQueries({ queryKey: ["paper", paper.id] });
      notifyLibraryChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.paperDelete(paper.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["papers"], refetchType: "active" });
      notifyLibraryChanged();
      onDeleted();
    },
  });
  const view = STATUS_VIEW[paper.read_status];
  const StatusIcon = view.icon;
  const current = STATUS_SEQUENCE.indexOf(paper.read_status);
  const deleteTitle = t("library.confirmDelete", { title: paper.title, id: paper.id });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => status.mutate(STATUS_SEQUENCE[(current + 1) % STATUS_SEQUENCE.length])}
        disabled={status.isPending}
        className={`litera-btn text-xs disabled:opacity-50 ${view.tone}`}
        title={t("library.statusToggle", { status: t(view.labelKey) })}
      >
        {status.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StatusIcon className="h-3.5 w-3.5" />}
        {t(view.labelKey)}
      </button>
      <button
        type="button"
        onClick={() => attach.mutate()}
        disabled={attach.isPending}
        className="litera-btn text-xs disabled:opacity-50"
        title={t("library.attachPdfTitle")}
      >
        {attach.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {t("library.attachPdf")}
      </button>
      {confirmingDelete ? (
        <>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="litera-btn text-xs text-litera-error disabled:opacity-50"
            title={deleteTitle}
          >
            {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {t("common.delete")}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} className="litera-btn text-xs">
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="litera-btn text-xs text-litera-error"
          title={deleteTitle}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("library.deletePaperTitle")}
        </button>
      )}
      <PaperTags paperId={paper.id} />
      <FolderPicker paperId={paper.id} />
      {attach.error && <p className="w-full text-xs text-litera-error">✕ {t("library.attachPdfFailed")}</p>}
      {remove.error && <p className="w-full text-xs text-litera-error">✕ {t("library.deleteFailed")}</p>}
    </div>
  );
}

/** Tag chips for one paper, with inline create-or-attach. */
function PaperTags({ paperId }: { paperId: string }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const { data: tags = [] } = useQuery({
    queryKey: ["paper-tags", paperId],
    queryFn: () => api.paperTags(paperId),
  });
  const detach = useMutation({
    mutationFn: (tagId: number) => api.paperDetachTag(paperId, tagId),
    onSuccess: () => invalidateTags(queryClient, paperId),
  });
  const attachNamed = useMutation({
    mutationFn: (tagName: string) => attachTagByName(paperId, tagName),
    onSuccess: () => {
      setName("");
      setAdding(false);
      invalidateTags(queryClient, paperId);
    },
  });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]"
          style={tagStyle(tag.color)}
        >
          <TagIcon className="h-2.5 w-2.5" />
          {tag.name}
          <button
            type="button"
            onClick={() => detach.mutate(tag.id)}
            className="ml-0.5 opacity-50 hover:opacity-100"
            title={`${t("common.delete")} ${tag.name}`}
            aria-label={`${t("common.delete")} ${tag.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) attachNamed.mutate(name.trim());
              if (event.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder={t("library.filterTag")}
            aria-label={t("library.filterTag")}
            className="litera-input w-32 py-0.5 text-[11px]"
          />
          <button
            type="button"
            onClick={() => name.trim() && attachNamed.mutate(name.trim())}
            className="text-litera-mute hover:text-litera-text"
            title={t("library.filterTag")}
            aria-label={t("library.filterTag")}
          >
            {attachNamed.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-litera-line px-1.5 py-0.5 text-[11px] text-litera-mute hover:border-litera-mute hover:text-litera-text"
        >
          <Plus className="h-2.5 w-2.5" /> {t("library.filterTag")}
        </button>
      )}
    </div>
  );
}

async function attachTagByName(paperId: string, name: string): Promise<void> {
  const existing = (await api.tagsList()).find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  const tagId = existing?.id ?? (await api.tagCreate(name)).id;
  await api.paperAttachTag(paperId, tagId);
}

function invalidateTags(queryClient: ReturnType<typeof useQueryClient>, paperId: string) {
  queryClient.invalidateQueries({ queryKey: ["paper-tags", paperId] });
  queryClient.invalidateQueries({ queryKey: ["tags-list"] });
  notifyLibraryChanged();
}

function tagStyle(color: string | null) {
  return {
    borderColor: color ?? "color-mix(in srgb, var(--litera-accent) 40%, transparent)",
    color: color ?? "var(--litera-accent)",
    backgroundColor: color ?? "color-mix(in srgb, var(--litera-accent) 10%, transparent)",
  };
}
