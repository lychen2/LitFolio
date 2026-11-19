import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Channel } from "@tauri-apps/api/core";
import { Loader2, X } from "lucide-react";
import { LitReviewDialog } from "@/components/LitReviewDialog";
import { ExportCitationsDialog } from "@/components/ExportCitationsDialog";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { api, type Paper } from "@/lib/api";
import type { ReadingAction, ReadingHostAction } from "@/lib/apiReadingService";
import { cn } from "@/lib/cn";
import { errorMessage, errorMessageOr } from "@/lib/error";
import { zoteroErrorMessage } from "@/lib/zoteroError";
import { notifyLibraryChanged } from "@/lib/libraryRefresh";
import { SelectionTranslatePane } from "@/pages/reader/SelectionTranslatePane";
import { FolderSidebar } from "./FolderSidebar";
import { PaperDetailDrawer } from "./PaperDetailDrawer";
import { QuickReadDrawer } from "./QuickReadDrawer";
import { ReadingQueue } from "./ReadingQueue";
import { SimilarPapersPanel } from "./SimilarPapersPanel";
import { useDialogKeyboard } from "@/components/useDialogKeyboard";

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
  /** Stable handler for `CoreFrame`'s `onAction`. */
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
  | { kind: "export"; paperIds: string[] }
  | { kind: "zotero-confirm"; skippedIds: string[]; initiallyPushed: number };

interface Banner {
  tone: "busy" | "error" | "notice";
  text: string;
}

interface ModelTask {
  key: number;
  text: string;
  executionId?: string;
  cancelling?: boolean;
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
  const [modelTasks, setModelTasks] = useState<ModelTask[]>([]);
  const close = useCallback(() => setSurface(null), []);
  const options = useRef({ collections, onOpenReader });
  useEffect(() => {
    options.current = { collections, onOpenReader };
  });
  const latestAction = useRef(0);

  const openReader = useCallback(
    (paperId: string) => {
      setSurface(null);
      const override = options.current.onOpenReader;
      if (override) override(paperId);
      else navigate(`/reader/${paperId}`);
    },
    [navigate],
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
    async (paperIds: string[]): Promise<string | null> => {
      let result;
      try {
        result = await api.zoteroPush(paperIds, false);
      } catch (error) {
        throw new Error(zoteroErrorMessage(error, t));
      }
      if (result.skipped.length > 0) {
        setSurface({ kind: "zotero-confirm", skippedIds: result.skipped, initiallyPushed: result.pushed });
        return null;
      }
      return t("library.zoteroPushed", { count: String(result.pushed) });
    },
    [t],
  );

  const run = useCallback(
    async (plan: LibraryActionPlan, onStarted?: Channel<string>): Promise<string | null> => {
      switch (plan.surface) {
        case "reader":
          openReader(plan.paperId);
          return null;
        case "queue-open":
          setSurface({ kind: "queue" });
          return null;
        case "collections":
          if (options.current.collections) setSurface({ kind: "collections" });
          else navigate("/library?panel=collections");
          return null;
        case "selection-translate":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "selection", paperId: plan.paperId, text: plan.text });
          return null;
        case "review":
          setSurface({ kind: "review", paperIds: plan.paperIds });
          return null;
        case "export":
          setSurface({ kind: "export", paperIds: plan.paperIds });
          return null;
        case "zotero":
          return pushZotero(plan.paperIds);
        case "queue-add":
          await Promise.all(plan.paperIds.map((id) => api.queueAdd(id)));
          await queryClient.invalidateQueries({ queryKey: ["queue"] });
          notifyLibraryChanged();
          return t("import.sidebar.queueDone");
        case "details":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "detail", paperId: plan.paperId });
          return null;
        case "tldr":
        case "translate-metadata":
          if (plan.surface === "tldr") await api.paperTldr(plan.paperId, onStarted);
          else await api.paperTranslate(plan.paperId, llmLanguageNameFor(lang), onStarted);
          await refreshPaper(plan.paperId);
          return null;
        case "quick-read":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "quick-read", paperId: plan.paperId });
          return null;
        case "similar":
          await ensurePaper(plan.paperId);
          setSurface({ kind: "similar", paperId: plan.paperId });
          return null;
      }
    },
    [ensurePaper, lang, navigate, openReader, pushZotero, queryClient, refreshPaper, t],
  );

  const confirmZoteroPush = useCallback(async () => {
    if (surface?.kind !== "zotero-confirm") return;
    const confirmation = surface;
    setSurface(null);
    try {
      const result = await api.zoteroPush(confirmation.skippedIds, true);
      setBanner({ tone: "notice", text: t("library.zoteroPushed", { count: String(confirmation.initiallyPushed + result.pushed) }) });
    } catch (error) {
      setBanner({ tone: "error", text: zoteroErrorMessage(error, t) });
    }
  }, [surface, t]);

  const cancelZoteroPush = useCallback(() => {
    if (surface?.kind !== "zotero-confirm") return;
    setBanner({ tone: "notice", text: t("library.zoteroSkipped", { count: String(surface.skippedIds.length) }) });
    setSurface(null);
  }, [surface, t]);
  const onAction = useCallback(
    (message: ReadingHostAction) => {
      const token = ++latestAction.current;
      const plan = planLibraryAction(message);
      const isModelTask = plan.surface === "tldr" || plan.surface === "translate-metadata";
      let onStarted: Channel<string> | undefined;
      setBanner(null);
      if (isModelTask) {
        const text = t(plan.surface === "tldr" ? "library.generatingTldr" : "library.translatingMetadata");
        setModelTasks((tasks) => [...tasks, { key: token, text }]);
        onStarted = new Channel<string>((executionId) => {
          setModelTasks((tasks) => tasks.map((task) => task.key === token ? { ...task, executionId } : task));
        });
      }
      void (async () => {
        try {
          const notice = await run(plan, onStarted);
          if (notice && latestAction.current === token) setBanner({ tone: "notice", text: notice });
        } catch (error) {
          if (isModelTask && errorMessage(error) === "cancelled") {
            setBanner({ tone: "notice", text: t("library.actionCancelled") });
          } else if (isModelTask || latestAction.current === token) {
            setBanner({ tone: "error", text: errorMessageOr(error, t("reader.unknownError")) });
          }
        } finally {
          if (isModelTask) setModelTasks((tasks) => tasks.filter((task) => task.key !== token));
        }
      })();
    },
    [run, t],
  );

  const cancelModelTask = useCallback(async ({ key, executionId }: ModelTask) => {
    if (!executionId) return;
    setModelTasks((tasks) => tasks.map((task) => task.key === key ? { ...task, cancelling: true } : task));
    try {
      if (await api.aiCancelExecution(executionId)) return;
    } catch (error) {
      setBanner({ tone: "error", text: errorMessageOr(error, t("reader.unknownError")) });
    }
    setModelTasks((tasks) => tasks.map((task) => task.key === key ? { ...task, cancelling: false } : task));
  }, [t]);

  return {
    onAction,
    ui: (
      <>
        {(banner || modelTasks.length > 0) && (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2">
            {modelTasks.map((task) => (
              <HostBanner
                key={task.key}
                banner={{ tone: "busy", text: task.text }}
                onCancel={() => void cancelModelTask(task)}
                cancelDisabled={!task.executionId || task.cancelling}
              />
            ))}
            {banner && <HostBanner banner={banner} onDismiss={() => setBanner(null)} />}
          </div>
        )}
        {surface?.kind === "detail" && (
          <LivePaper paperId={surface.paperId}>
            {(paper) => (
              <PaperDetailDrawer
                paper={paper}
                onClose={close}
                onAction={(action: ReadingAction) => onAction({ type: "action", action, paperIds: [paper.id] })}
              />
            )}
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
        {surface?.kind === "zotero-confirm" && (
          <HostDrawer title={t("library.zoteroConfirmTitle")} onClose={cancelZoteroPush}>
            <div className="flex h-full flex-col gap-4 p-5">
              <p className="text-sm text-litera-text">
                {t("library.zoteroRepushConfirm", { count: String(surface.skippedIds.length) })}
              </p>
              <div className="mt-auto flex justify-end gap-2">
                <button onClick={cancelZoteroPush} className="litera-btn text-xs">{t("common.cancel")}</button>
                <button onClick={() => void confirmZoteroPush()} className="litera-btn-primary text-xs">
                  {t("library.zoteroConfirmPush")}
                </button>
              </div>
            </div>
          </HostDrawer>
        )}
      </>
    ),
  };
}

function HostBanner({ banner, onDismiss, onCancel, cancelDisabled }: {
  banner: Banner;
  onDismiss?: () => void;
  onCancel?: () => void;
  cancelDisabled?: boolean;
}) {
  const { t } = useI18n();
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
        "pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg",
        tone,
      )}
    >
      {banner.tone === "busy" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="break-words">{banner.text}</span>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={cancelDisabled} className="litera-btn text-xs">
          {t("common.cancel")}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-1 shrink-0 opacity-70 hover:opacity-100"
          aria-label={t("common.close")}
          title={t("common.close")}
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
  const dialog = useDialogKeyboard(onClose);
  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop"
      onClick={onClose}
    >
      <div
        {...dialog}
        aria-label={title}
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
