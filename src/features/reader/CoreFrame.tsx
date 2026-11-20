import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Spinner } from "@/components/icons";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/error";
import { parseReadingHostMessage, readingServiceApi } from "@/lib/apiReadingService";
import type { ReaderShortcut, ReadingHostAction } from "@/lib/apiReadingService";
import { subscribeLibraryChanged } from "@/lib/libraryRefresh";
import { api } from "@/lib/api";

const THEME_VARS = [
  "bg", "paper", "panel", "subnav", "surface-1", "surface-2", "line", "text", "mute", "text-subtle",
  "border", "border-strong", "accent", "accent-contrast", "accent2", "info", "success", "warn", "error",
  "focus", "ink", "annotation-bg", "annotation-ink", "font-sans", "shadow-md", "shadow-lg",
  "space-1", "space-2", "space-3", "space-4", "space-6", "control-sm", "control-md",
  "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full", "hover", "selected", "scrim",
];

export interface LibraryFrameCollections {
  choices: Array<{ key: string; title: string; depth?: number }>;
  activeKey: string | null;
  paperIds: string[] | null;
  pending: boolean;
  failed: boolean;
}

/** Upstream pages retain their HTTP/WS origin; the frame has no host IPC grant. */
export function CoreFrame({
  paperId, onAction, libraryCollections, onSelectCollection, onRetryCollection,
  onShortcut, onReaderControl, extrasOpen, canSplit, splitView, hasHighlights, showImport,
}: {
  paperId?: string;
  /** Paper and selection actions the reader offers to the host's own tools. */
  onAction?: (action: ReadingHostAction) => void;
  libraryCollections?: LibraryFrameCollections;
  onSelectCollection?: (key: string | null) => void;
  onRetryCollection?: () => void;
  onShortcut?: (key: ReaderShortcut) => void;
  onReaderControl?: (control: "extras" | "split") => void;
  extrasOpen?: boolean;
  canSplit?: boolean;
  splitView?: boolean;
  hasHighlights?: boolean;
  showImport?: boolean;
}) {
  const t = useT();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const frame = useRef<HTMLIFrameElement>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const session = useQuery({
    queryKey: ["readingServiceSession", paperId ?? null],
    queryFn: () => readingServiceApi.open(paperId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const url = session.data?.url;

  const publishTheme = useCallback(() => {
    if (!url) return;
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const tokens: Record<string, string> = {};
    for (const name of THEME_VARS) {
      tokens[name] = styles.getPropertyValue(`--litera-${name}`).trim();
    }
    frame.current?.contentWindow?.postMessage({
      source: "litfolio-host", type: "theme", theme: root.dataset.theme,
      colorScheme: styles.colorScheme, tokens,
    }, new URL(url).origin);
  }, [url]);

  /**
   * The host language is authoritative and the frame adopts it through the
   * upstream preference, so one dictionary stays in charge. It is republished
   * on every load because the reload it triggers starts a fresh document.
   */
  const publishLocale = useCallback(() => {
    if (!url) return;
    frame.current?.contentWindow?.postMessage(
      { source: "litfolio-host", type: "locale", lang },
      new URL(url).origin,
    );
  }, [url, lang]);

  useEffect(() => {
    if (!url) return;
    const observer = new MutationObserver(publishTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "style", "class"] });
    publishTheme();
    return () => observer.disconnect();
  }, [url, publishTheme]);

  useEffect(() => {
    publishLocale();
  }, [publishLocale]);

  const publishControls = useCallback(() => {
    if (!url) return;
    const origin = new URL(url).origin;
    if (libraryCollections) {
      frame.current?.contentWindow?.postMessage({
        source: "litfolio-host", type: "library-collections", ...libraryCollections,
      }, origin);
    }
    if (paperId) {
      frame.current?.contentWindow?.postMessage({
        source: "litfolio-host", type: "reader-controls", extrasOpen, canSplit, splitView, hasHighlights,
      }, origin);
    }
  }, [url, libraryCollections, paperId, extrasOpen, canSplit, splitView, hasHighlights]);

  /**
   * Host tools write papers through the same commands, so the framed list has
   * to reload: this is the single notification path from a host write to the
   * upstream page, next to the filter that already rides the same channel.
   */
  const publishLibraryChanged = useCallback(() => {
    if (!url) return;
    frame.current?.contentWindow?.postMessage(
      { source: "litfolio-host", type: "library-changed" },
      new URL(url).origin,
    );
  }, [url]);

  const publishHostState = useCallback(() => {
    publishTheme();
    publishLocale();
    publishControls();
  }, [publishTheme, publishLocale, publishControls]);

  useEffect(() => {
    publishControls();
  }, [publishControls]);

  /**
   * Host tools write the paper set behind the framed page, which fetched its
   * list before that write landed. This is its only reload signal; a write
   * that precedes a load needs none, because the new document reads the same
   * set itself.
   */
  useEffect(() => {
    if (!url) return;
    return subscribeLibraryChanged(publishLibraryChanged);
  }, [publishLibraryChanged, url]);

  useEffect(() => {
    if (!url) return;
    const origin = new URL(url).origin;
    let active = true;
    const receive = async (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      let message;
      try {
        message = parseReadingHostMessage(event.data);
      } catch {
        return; // Other upstream messages do not belong to the host protocol.
      }
      if (message.type === "ready") {
        publishHostState();
        return;
      }
      // Host tools act on the host's own store; nothing to sync for them.
      if (message.type === "action") {
        setSyncError(null);
        onAction?.(message);
        return;
      }
      if (message.type === "library-collection") {
        if (!paperId) onSelectCollection?.(message.key);
        return;
      }
      if (message.type === "library-collection-retry") {
        if (!paperId) onRetryCollection?.();
        return;
      }
      if (message.type === "reader-shortcut") {
        if (paperId) onShortcut?.(message.key);
        return;
      }
      if (message.type === "reader-control") {
        if (paperId) onReaderControl?.(message.control);
        return;
      }
      if (message.type === "note-ime-anchor") {
        const iframe = frame.current;
        if (!paperId || !isTauri() || !iframe || document.activeElement !== iframe) return;
        const bounds = iframe.getBoundingClientRect();
        const x = bounds.left + iframe.clientLeft + message.x;
        const y = bounds.top + iframe.clientTop + message.y;
        if (x < 0 || y < 0 || x >= Math.min(bounds.right, window.innerWidth) ||
            y >= Math.min(bounds.bottom, window.innerHeight)) return;
        const height = Math.min(message.height, bounds.bottom - y, window.innerHeight - y);
        await readingServiceApi.positionNoteIme(x, y, height).catch(() => undefined);
        return;
      }
      if (message.type === "navigate" && message.route.kind === "import") {
        if (!paperId) {
          const params = new URLSearchParams();
          if (message.route.tab) params.set("tab", message.route.tab);
          if (message.route.link) params.set("link", message.route.link);
          navigate(params.size ? `/import?${params}` : "/import");
        }
        return;
      }
      if (message.type === "delete") {
        if (paperId) return;
        let ok = false;
        try {
          await api.paperDelete(message.paperId);
          ok = true;
          if (active) setSyncError(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["papers"] }),
            queryClient.invalidateQueries({ queryKey: ["paper", message.paperId] }),
            queryClient.invalidateQueries({ queryKey: ["library-filter"] }),
          ]);
        } catch (error) {
          if (active) setSyncError(errorMessage(error));
        }
        if (active) frame.current?.contentWindow?.postMessage({
          source: "litfolio-host", type: "delete-result", requestId: message.requestId, ok,
        }, origin);
        return;
      }
      try {
        // Navigation consumes the catalog only after the service's mutation lands.
        await readingServiceApi.sync();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["papers"] }),
          queryClient.invalidateQueries({ queryKey: ["paper"] }),
          queryClient.invalidateQueries({ queryKey: ["paper-tags"] }),
          queryClient.invalidateQueries({ queryKey: ["library-filter"] }),
        ]);
        if (!active) return;
        setSyncError(null);
        if (message.type !== "navigate") return;
        switch (message.route.kind) {
          case "reader": navigate(`/reader/${message.route.paperId}`); break;
          case "library": navigate("/library"); break;
          case "settings": navigate("/settings?tab=profiles"); break;
        }
      } catch (error) {
        if (active) setSyncError(errorMessage(error));
      }
    };
    window.addEventListener("message", receive);
    return () => {
      active = false;
      window.removeEventListener("message", receive);
    };
  }, [url, navigate, queryClient, onAction, paperId, onSelectCollection, onRetryCollection, onShortcut, onReaderControl, publishHostState]);

  if (session.isLoading) {
    return <FrameStatus icon={<Spinner className="h-4 w-4 animate-spin" />} title={t("reader.reading.loading")} />;
  }
  if (session.error || !url) {
    return (
      <FrameStatus
        icon={<AlertTriangle className="h-5 w-5 text-litera-warn" />}
        title={t("reader.reading.failed")}
        detail={session.error ? errorMessage(session.error) : undefined}
        action={<button onClick={() => session.refetch()} className="litera-btn text-xs">{t("common.retry")}</button>}
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {syncError && <div role="alert" className="border-b border-litera-border px-4 py-2 text-xs text-litera-error">{syncError}</div>}
      <iframe
        ref={frame}
        title={t(showImport ? "import.tab.paper" : paperId ? "reader.reading.frameTitle" : "core.libraryFrame")}
        src={showImport ? new URL("/host/import", url).href : url}
        onLoad={publishHostState}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className="block min-h-0 w-full flex-1 border-0 bg-litera-bg"
      />
    </div>
  );
}

function FrameStatus({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  const t = useT();
  return (
    <div className="litera-frame-status grid h-full overflow-auto place-items-center px-6 text-center">
      <div className="min-w-0 max-w-md space-y-2">
        <div className="flex justify-center">{icon}</div>
        <div className="text-sm text-litera-text">{title}</div>
        {detail && (
          <details className="text-xs text-litera-mute">
            <summary className="mx-auto w-fit cursor-pointer">{t("reader.reading.details")}</summary>
            <p className="mt-2 break-words text-left">{detail}</p>
          </details>
        )}
        {action && <div className="flex justify-center pt-1">{action}</div>}
      </div>
    </div>
  );
}
