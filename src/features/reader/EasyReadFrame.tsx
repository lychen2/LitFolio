import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/error";
import { parseReadingHostMessage, readingServiceApi } from "@/lib/apiReadingService";
import type { ReadingHostAction } from "@/lib/apiReadingService";
import { subscribeLibraryChanged } from "@/lib/libraryRefresh";
import { api } from "@/lib/api";

const THEME_VARS = ["bg", "paper", "panel", "surface-2", "text", "mute", "text-subtle", "border", "border-strong", "accent", "accent-contrast", "accent2", "info", "success", "warn", "error", "focus", "ink", "font-sans", "shadow-md", "shadow-lg"];

/** Upstream pages retain their HTTP/WS origin; the frame has no host IPC grant. */
export function EasyReadFrame({ paperId, importReference, onImported, onAction, filterPaperIds }: {
  paperId?: string;
  importReference?: string;
  onImported?: (paperId: string, reference: string) => Promise<void>;
  /** Paper and selection actions the reader offers to the host's own tools. */
  onAction?: (action: ReadingHostAction) => void;
  /** Host-side paper filter: `null` shows everything, `[]` shows nothing. */
  filterPaperIds?: string[] | null;
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    publishTheme();
    return () => observer.disconnect();
  }, [url, publishTheme]);

  useEffect(() => {
    publishLocale();
  }, [publishLocale]);

  /**
   * The host's paper selection narrows the upstream list on top of its own
   * search and category state, so the frame republishes it after every load.
   */
  const publishFilter = useCallback(() => {
    if (!url) return;
    frame.current?.contentWindow?.postMessage(
      { source: "litfolio-host", type: "library-filter", paperIds: filterPaperIds ?? null },
      new URL(url).origin,
    );
  }, [url, filterPaperIds]);

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
    publishFilter();
  }, [publishTheme, publishLocale, publishFilter]);

  useEffect(() => {
    publishFilter();
  }, [publishFilter]);

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
      // Host tools act on the host's own store; nothing to sync for them.
      if (message.type === "action") {
        setSyncError(null);
        onAction?.(message);
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
            queryClient.invalidateQueries({ queryKey: ["queue"] }),
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
        if (message.type === "imported") await onImported?.(message.paperId, message.reference);
        setSyncError(null);
        if (message.type !== "navigate") return;
        switch (message.route.kind) {
          case "reader": navigate(`/reader/${message.route.paperId}`); break;
          case "library": navigate("/library"); break;
          case "settings": navigate("/settings?tab=profiles"); break;
          case "ask": navigate("/ask"); break;
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
  }, [url, navigate, queryClient, onImported, onAction, paperId]);

  if (session.isLoading) {
    return <FrameStatus icon={<Loader2 className="h-4 w-4 animate-spin" />} title={t("reader.reading.loading")} />;
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
  const source = importReference === undefined ? url : `${url}?litfolio=import&ref=${encodeURIComponent(importReference)}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {syncError && <div role="alert" className="border-b border-litera-border px-4 py-2 text-xs text-litera-error">{syncError}</div>}
      <iframe
        ref={frame}
        title={t(paperId ? "reader.reading.frameTitle" : "easyread.libraryFrame")}
        src={source}
        onLoad={publishHostState}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className="block min-h-0 w-full flex-1 border-0 bg-litera-bg"
      />
    </div>
  );
}

function FrameStatus({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-md space-y-2">
        <div className="flex justify-center">{icon}</div>
        <div className="text-sm text-litera-text">{title}</div>
        {detail && <div className="break-words text-xs text-litera-mute">{detail}</div>}
        {action && <div className="flex justify-center pt-1">{action}</div>}
      </div>
    </div>
  );
}
