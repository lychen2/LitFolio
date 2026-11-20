import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XCircle, Spinner, Paperclip, Plus, Tag as TagIcon, X } from "@/components/icons";
import { api, pickSinglePdf, type Paper, type ReadStatus } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { notifyLibraryChanged } from "@/lib/libraryRefresh";
import { FolderPicker } from "./FolderPicker";
import { updatePaperStatusCache } from "./paperStatusCache";
const STATUS_OPTIONS = [
  ["unread", "common.unread"],
  ["reading", "common.reading"],
  ["read", "common.read"],
  ["must", "common.must"],
] as const;

export function PaperHostMeta({ paper }: { paper: Paper }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
  const statusLabel = t("library.filterStatus");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={statusLabel} className="inline-flex rounded-[var(--litera-radius)] border border-litera-line p-0.5">
        {STATUS_OPTIONS.map(([value, key]) => {
          const selected = (status.isPending ? status.variables : paper.read_status) === value;
          return (
            <button key={value} type="button" aria-pressed={selected} disabled={status.isPending}
              onClick={() => status.mutate(value)}
              className={`rounded px-2 py-1 text-xs ${selected ? "bg-litera-accent/20 text-litera-accent" : "text-litera-mute hover:text-litera-text"}`}>
              {t(key)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => attach.mutate()}
        disabled={attach.isPending}
        className="litera-btn text-xs disabled:opacity-50"
        title={t("library.attachPdfTitle")}
      >
        {attach.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {t("library.attachPdf")}
      </button>
      <PaperTags paperId={paper.id} />
      <FolderPicker paperId={paper.id} />
      {attach.error && <p className="w-full text-xs text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{t("library.attachPdfFailed")}</p>}
      {status.error && <p role="alert" className="w-full text-xs text-litera-error">{t("library.statusUpdateFailed")}</p>}
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
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === "Enter" && name.trim()) attachNamed.mutate(name.trim());
              if (event.key === "Escape") {
                event.stopPropagation();
                setAdding(false);
                setName("");
              }
            }}
            placeholder={t("paper.detail.category")}
            aria-label={t("paper.detail.category")}
            className="litera-input w-32 py-0.5 text-[11px]"
          />
          <button
            type="button"
            onClick={() => name.trim() && attachNamed.mutate(name.trim())}
            className="text-litera-mute hover:text-litera-text"
            title={t("paper.detail.category")}
            aria-label={t("paper.detail.category")}
          >
            {attachNamed.isPending ? <Spinner className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-litera-line px-1.5 py-0.5 text-[11px] text-litera-mute hover:border-litera-mute hover:text-litera-text"
        >
          <Plus className="h-2.5 w-2.5" /> {t("paper.detail.category")}
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
