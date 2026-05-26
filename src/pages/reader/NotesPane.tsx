import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, NotebookPen, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

/**
 * Right-pane Markdown editor for papers/<id>/note.md.
 * - Loads initial content on mount via api.noteGet
 * - Debounces saves (1s) via api.noteSave
 * - Surfaces dirty / saving / saved state in the header so user knows what's persisted
 */
export function NotesPane({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const initial = useQuery({
    queryKey: ["note", paperId],
    queryFn: () => api.noteGet(paperId),
    // Notes shouldn't auto-refetch behind the user's typing — they'd nuke unsaved edits
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const [content, setContent] = useState<string>("");
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    if (initial.data !== undefined && !bootstrapped) {
      setContent(initial.data);
      setSavedSnapshot(initial.data);
      setBootstrapped(true);
    }
  }, [initial.data, bootstrapped]);

  const save = useMutation({
    mutationFn: (next: string) => api.noteSave(paperId, next),
    onSuccess: (_void, next) => {
      setSavedSnapshot(next);
      qc.setQueryData(["note", paperId], next);
    },
  });

  // Debounced autosave
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!bootstrapped) return;
    if (content === savedSnapshot) return;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save.mutate(content), 1000);
    return () => { if (timerRef.current !== undefined) window.clearTimeout(timerRef.current); };
  }, [content, savedSnapshot, bootstrapped, save]);

  const dirty = content !== savedSnapshot;
  const status = save.isPending ? "saving" : dirty ? "dirty" : "saved";

  return (
    <div className="h-full flex flex-col bg-litera-paper/30">
      <div className="px-3 py-2 border-b border-litera-line flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-litera-mute flex items-center gap-1.5">
          <NotebookPen className="h-3.5 w-3.5" /> {t("reader.tabNotes")}
        </div>
        <SaveStatus status={status} error={save.error as Error | null} />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        disabled={!bootstrapped}
        placeholder={initial.isLoading ? t("reader.loadingNote") : t("reader.notePlaceholder")}
        className="flex-1 resize-none bg-transparent border-0 outline-none px-4 py-3 text-sm text-litera-text font-mono leading-relaxed placeholder:text-litera-mute focus:ring-0"
      />
    </div>
  );
}

function SaveStatus({ status, error }: { status: "saving" | "dirty" | "saved"; error: Error | null }) {
  const t = useT();
  if (error) {
    return <span className="text-[11px] text-red-400/90">✕ {t("reader.saveFailed")}: {error.message}</span>;
  }
  if (status === "saving") {
    return <span className="text-[11px] text-litera-accent2 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("reader.saving")}</span>;
  }
  if (status === "dirty") {
    return <span className="text-[11px] text-amber-400/80">● {t("reader.unsaved")}</span>;
  }
  return <span className="text-[11px] text-litera-mute flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> {t("reader.saved")}</span>;
}
