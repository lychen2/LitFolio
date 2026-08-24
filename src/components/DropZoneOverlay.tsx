import { useEffect } from "react";
import { FileUp, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import type { PdfImportSummary } from "@/lib/api";

interface DropZoneOverlayProps {
  isDragging: boolean;
  importing: boolean;
  result: PdfImportSummary | null;
  onDismiss: () => void;
}

export function DropZoneOverlay({
  isDragging,
  importing,
  result,
  onDismiss,
}: DropZoneOverlayProps) {
  const t = useT();

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  if (!isDragging && !importing && !result) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      style={{ pointerEvents: importing ? "auto" : "none" }}
    >
      {isDragging && !importing && !result && (
        <div className="pointer-events-auto bg-litera-paper/90 backdrop-blur-sm border-2 border-dashed border-litera-accent rounded-2xl p-10 flex flex-col items-center gap-3 shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <FileUp className="h-10 w-10 text-litera-accent" />
          <div className="text-base font-medium text-litera-text">
            {t("drop.title")}
          </div>
          <div className="text-xs text-litera-mute">{t("drop.hint")}</div>
        </div>
      )}

      {importing && (
        <div className="pointer-events-auto bg-litera-paper/90 backdrop-blur-sm border border-litera-line rounded-2xl p-8 flex flex-col items-center gap-3 shadow-xl">
          <Loader2 className="h-8 w-8 text-litera-accent animate-spin" />
          <div className="text-sm text-litera-text">{t("drop.importing")}</div>
        </div>
      )}

      {result && !importing && (
        <div
          className="pointer-events-auto bg-litera-paper/90 backdrop-blur-sm border border-litera-line rounded-2xl p-6 flex flex-col items-center gap-2 shadow-xl cursor-pointer"
          onClick={onDismiss}
        >
          {result.failed.length === 0 ? (
            <>
              <CheckCircle2 className="h-7 w-7 text-litera-success" />
              <div className="text-sm text-litera-text">
                {t("drop.done", { ok: String(result.imported.length) })}
              </div>
            </>
          ) : result.imported.length === 0 ? (
            <>
              <XCircle className="h-7 w-7 text-litera-error" />
              <div className="text-sm text-litera-error">
                {result.failed.map((f) => f.error).join("; ")}
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-7 w-7 text-litera-warn" />
              <div className="text-sm text-litera-text">
                {t("drop.doneWithFail", {
                  ok: String(result.imported.length),
                  fail: String(result.failed.length),
                })}
              </div>
            </>
          )}
          <div className="text-[11px] text-litera-mute mt-1">
            {t("common.open")} / {t("nav.library")}
          </div>
        </div>
      )}
    </div>
  );
}
