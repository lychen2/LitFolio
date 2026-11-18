import { useCallback, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { LitReviewDialog } from "@/components/LitReviewDialog";
import { ExportCitationsDialog } from "@/components/ExportCitationsDialog";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { api, type Paper } from "@/lib/api";
import type { ReadingHostAction } from "@/lib/apiReadingService";
import { cn } from "@/lib/cn";
import { errorMessageOr } from "@/lib/error";
import { zoteroErrorMessage } from "@/lib/zoteroError";
import { notifyLibraryChanged } from "@/lib/libraryRefresh";
import { SelectionTranslatePane } from "@/pages/reader/SelectionTranslatePane";
import { FolderSidebar } from "./FolderSidebar";
import { PaperDetailDrawer } from "./PaperDetailDrawer";
import { QuickReadDrawer } from "./QuickReadDrawer";
import { ReadingQueue } from "./ReadingQueue";
import { SimilarPapersPanel } from "./SimilarPapersPanel";

/**
 * Host-side plan for one action the hosted reader sends. Single-paper tools
 * take the first ID; review, export, Zotero and queue work on the whole
 * selection; the reader's own panels resolve to a reader route because the
 * upstream page already owns them.
 */
export type LibraryActionPlan =
  | { surface: "details"; paperId: string }
  | { surface: "tldr"; paperId: string }
  | { surface: "quick-read"; paperId: string }
  | { surface: "translate-metadata"; paperId: string }
  | { surface: "similar"; paperId: string }
  | { surface: "review"; paperIds: string[] }
  | { surface: "export"; paperIds: string[] }
  | { surface: "zotero"; paperIds: string[] }
  | { surface: "queue-add"; paperIds: string[] }
  | { surface: "queue-open" }
  | { surface: "collections" }
  | { surface: "selection-translate"; paperId: string; text: string }
  | { surface: "reader"; paperId: string };

/** Pure action-to-surface mapping, so the library and the reader agree on each action. */
export function planLibraryAction(message: ReadingHostAction): LibraryActionPlan {
  const [paperId] = message.paperIds;
  switch (message.action) {
    case "queue-open":
      return { surface: "queue-open" };
    case "collections":
      return { surface: "collections" };
    case "terms":
    case "notes":
    case "highlights":
    case "cached":
    case "pdf":
      if (!paperId) throw new Error(`library action ${message.action} needs a paper ID`);
      return { surface: "reader", paperId };
    case "selection-translate": {
      const text = message.text?.trim();
      if (!paperId || !text) {
        throw new Error("library action selection-translate needs a paper ID and selected text");
      }
      return { surface: "selection-translate", paperId, text };
    }
    case "review":
    case "export":
    case "zotero":
    case "queue-add":
      if (message.paperIds.length === 0) throw new Error(`library action ${message.action} needs paper IDs`);
      return { surface: message.action, paperIds: message.paperIds };
    case "details":
    case "tldr":
    case "quick-read":
    case "translate-metadata":
    case "similar":
      if (!paperId) throw new Error(`library action ${message.action} needs a paper ID`);
      return { surface: message.action, paperId };
  }
}

/**
 * Folder and smart-collection context. A host without collection chrome (the
 * reader) omits it, and the collections action then opens the library.
 */
export interface LibraryCollectionBinding {
  folderId: number | null;
  smartId: number | null;
  onSelectFolder: (id: number | null) => void;
  onSelectSmart: (id: number | null) => void;
}

export interface LibraryHostActionsOptions {
  collections?: LibraryCollectionBinding;
  /** Reader navigation override; defaults to `/reader/<paperId>`. */
  onOpenReader?: (paperId: string) => void;
}

export interface LibraryHostActionsController {
  /** Stable handler for `EasyReadFrame`'s `onAction`. */
  onAction: (message: ReadingHostAction) => void;
  /** Render once per host: the status banner and whichever surface is open. */
  ui: ReactNode;
}

type Surface =
  | { kind: "detail"; paperId: string }
  | { kind: "quick-read"; paperId: string }
  | { kind: "similar"; paperId: string }
  | { kind: "selection"; paperId: string; text: string }
  | { kind: "queue" }
  | { kind: "collections" }
  | { kind: "review"; paperIds: string[] }
  | { kind: "export"; paperIds: string[] };

interface Banner {
  tone: "busy" | "error" | "notice";
  text: string;
}

/**
 * Host tools for the canonical hosted library. The upstream page keeps the
 * single list and the reading surface; each AI capability the retired
 * LitFolio list offered stays reachable here through the same commands and
 * the same result drawers, so one workflow keeps one owner.
 *
 * Mount exactly one controller per host. The reader assembles its extras
 * panel itself, so a reader-side host passes its own `collections` binding
 * and only uses the single-paper actions.
 */
export function useLibraryHostActions({
  collections,
  onOpenReader,
}: LibraryHostActionsOptions): LibraryHostActionsController {
  const { lang, t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [surface, setSurface] = useState<Surface | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const close = useCallback(() => setSurface(null), []);

  const openReader = useCallback(
    (paperId: string) => {
      if (onOpenReader) onOpenReader(paperId);
      else navigate(`/reader/${paperId}`);
    },
    [navigate, onOpenReader],
  );

  const ensurePaper = useCallback(
    async (paperId: string) => {
      if (!(await api.paperGet(paperId))) throw new Error(t("reader.notFound"));
    },
    [t],
  );

  /**
   * Generation writes the paper row, so refresh it before the surface opens.
   * The framed list renders its own copy, so it gets the same notification.
   */
  const refreshPaper = useCallback(
    async (paperId: string) => {
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
      await queryClient.invalidateQueries({ queryKey: ["paper", paperId] });
      notifyLibraryChanged();
    },
    [queryClient],
  );

  const pushZotero = useCallback(
    async (paperIds: string[], force: boolean): Promise<void> => {
      let result;
      try {
        result = await api.zoteroPush(paperIds, force);
      } catch (error) {
        throw new Error(zoteroErrorMessage(error, t));
      }
      if (result.skipped.length > 0 && !force) {
        if (window.confirm(t("library.zoteroRepushConfirm", { count: String(result.skipped.length) }))) {
          await pushZotero(result.skipped, true);
          return;
        }
        setBanner({ tone: "notice", text: t("library.zoteroSkipped", { count: String(result.skipped.length) }) });
        return;
      }
      setBanner({ tone: "notice", text: t("library.zoteroPushed", { count: String(result.pushed) }) });
    },
    [t],
  );

  const run = useCallback(
    async (plan: LibraryActionPlan) => {
      switch (plan.surface) {
        case "reader":
          openReader(plan.paperId);
          return;
        case "queue-open":
          setSurface({ kind: "queue" });
          return;
        case "collections":
          if (collections) setSurface({ kind: "collections" });
          else navigate("/library?panel=collections");
          return;
        case "selection-translate":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "selection", paperId: plan.paperId, text: plan.text });
          return;
        case "review":
          setSurface({ kind: "review", paperIds: plan.paperIds });
          return;
        case "export":
          setSurface({ kind: "export", paperIds: plan.paperIds });
          return;
        case "zotero":
          await pushZotero(plan.paperIds, false);
          return;
        case "queue-add":
          await Promise.all(plan.paperIds.map((id) => api.queueAdd(id)));
          await queryClient.invalidateQueries({ queryKey: ["queue"] });
          notifyLibraryChanged();
          setBanner({ tone: "notice", text: t("import.sidebar.queueDone") });
          return;
        case "details":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "detail", paperId: plan.paperId });
          return;
        case "tldr":
          await ensurePaper(plan.paperId);
          await api.paperTldr(plan.paperId);
          await refreshPaper(plan.paperId);
          setSurface({ kind: "detail", paperId: plan.paperId });
          return;
        case "translate-metadata":
          await ensurePaper(plan.paperId);
          await api.paperTranslate(plan.paperId, llmLanguageNameFor(lang));
          await refreshPaper(plan.paperId);
          setSurface({ kind: "detail", paperId: plan.paperId });
          return;
        case "quick-read":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "quick-read", paperId: plan.paperId });
          return;
        case "similar":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "similar", paperId: plan.paperId });
          return;
      }
    },
    [collections, ensurePaper, lang, navigate, openReader, pushZotero, queryClient, refreshPaper, t],
  );

  const onAction = useCallback(
    (message: ReadingHostAction) => {
      setBanner({ tone: "busy", text: t("common.loading") });
      void (async () => {
        try {
          await run(planLibraryAction(message));
          setBanner(null);
        } catch (error) {
          setBanner({ tone: "error", text: errorMessageOr(error, t("reader.unknownError")) });
        }
      })();
    },
    [run, t],
  );

  return {
    onAction,
    ui: (
      <>
        {banner && <HostBanner banner={banner} onDismiss={() => setBanner(null)} />}
        {surface?.kind === "detail" && (
          <LivePaper paperId={surface.paperId}>
            {(paper) => <PaperDetailDrawer paper={paper} onClose={close} />}
          </LivePaper>
        )}
        {surface?.kind === "quick-read" && (
          <LivePaper paperId={surface.paperId}>
            {(paper) => <QuickReadDrawer paper={paper} onClose={close} />}
          </LivePaper>
        )}
        {surface?.kind === "similar" && (
          <LivePaper paperId={surface.paperId}>
            {(paper) => <SimilarPapersPanel paperId={paper.id} paperTitle={paper.title} onClose={close} />}
          </LivePaper>
        )}
        {surface?.kind === "selection" && (
          <HostDrawer title={t("reader.translated")} onClose={close}>
            <SelectionTranslatePane paperId={surface.paperId} selectionText={surface.text} />
          </HostDrawer>
        )}
        {surface?.kind === "queue" && (
          <HostDrawer title={t("queue.title")} onClose={close}>
            <ReadingQueue onOpenPaper={openReader} />
          </HostDrawer>
        )}
        {surface?.kind === "collections" && collections && (
          <HostDrawer title={t("folders.title")} onClose={close} sizing="w-[320px]" flush>
            <FolderSidebar
              embedded
              selectedId={collections.folderId}
              selectedSmartId={collections.smartId}
              compactOpen
              onSelect={(id) => {
                collections.onSelectFolder(id);
                collections.onSelectSmart(null);
                close();
              }}
              onSelectSmart={(id) => {
                collections.onSelectSmart(id);
                collections.onSelectFolder(null);
                close();
              }}
              onClose={close}
            />
          </HostDrawer>
        )}
        {surface?.kind === "review" && (
          <LitReviewDialog paperIds={surface.paperIds} paperCount={surface.paperIds.length} onClose={close} />
        )}
        {surface?.kind === "export" && <ExportCitationsDialog paperIds={surface.paperIds} onClose={close} />}
      </>
    ),
  };
}

function HostBanner({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const tone =
    banner.tone === "error"
      ? "border-litera-error/40 bg-litera-error/12 text-litera-error"
      : banner.tone === "notice"
        ? "border-litera-success/40 bg-litera-success/12 text-litera-success"
        : "border-litera-border bg-litera-panel text-litera-mute";
  return (
    <div
      role={banner.tone === "error" ? "alert" : "status"}
      className={cn(
        "fixed bottom-5 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg",
        tone,
      )}
    >
      {banner.tone === "busy" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="break-words">{banner.text}</span>
      {banner.tone !== "busy" && (
        <button
          onClick={onDismiss}
          className="ml-1 shrink-0 opacity-70 hover:opacity-100"
          aria-label="dismiss"
          title="dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function HostDrawer({
  title,
  sizing = "w-[560px]",
  flush,
  children,
  onClose,
}: {
  title: string;
  sizing?: string;
  flush?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  const t = useI18n().t;
  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "litera-drawer-enter flex h-full max-w-[94vw] flex-col border-l border-litera-line bg-litera-paper shadow-2xl",
          sizing,
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-litera-line px-4 py-3">
          <span className="litera-section-label">{title}</span>
          <button
            onClick={onClose}
            className="ml-auto text-litera-mute hover:text-litera-text"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className={cn("min-h-0 flex-1", !flush && "overflow-hidden")}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Renders whichever surface is open from the live `["paper", id]` query, so a
 * tag, status, PDF attach or generated TL;DR on that paper re-renders the
 * drawer instead of leaving a stale snapshot on screen.
 */
function LivePaper({
  paperId,
  children,
}: {
  paperId: string;
  children: (paper: Paper) => ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => api.paperGet(paperId),
  });
  if (!data) return null;
  return <>{children(data)}</>;
}
