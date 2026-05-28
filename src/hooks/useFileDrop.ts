import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api, type PdfImportSummary } from "@/lib/api";
import { findPdfDropTarget } from "@/hooks/usePdfDropTarget";

interface DragPayload {
  paths: string[];
  position: { x: number; y: number };
}

export function useFileDrop() {
  const qc = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PdfImportSummary | null>(null);

  const clearResult = useCallback(() => setResult(null), []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      unlisteners.push(
        await listen<DragPayload>("tauri://drag-enter", (e) => {
          const pdfPaths = e.payload.paths.filter((p) =>
            p.toLowerCase().endsWith(".pdf"),
          );
          if (pdfPaths.length > 0) setIsDragging(true);
        }),
      );

      unlisteners.push(
        await listen("tauri://drag-leave", () => {
          setIsDragging(false);
        }),
      );

      unlisteners.push(
        await listen<DragPayload>("tauri://drag-drop", async (e) => {
          setIsDragging(false);
          const pdfPaths = e.payload.paths.filter((p) =>
            p.toLowerCase().endsWith(".pdf"),
          );
          if (pdfPaths.length === 0) return;

          const dropTarget = findPdfDropTarget(e.payload.position);
          if (dropTarget) {
            setImporting(true);
            setResult(null);
            try {
              await dropTarget(pdfPaths);
            } catch (err) {
              setResult({
                imported: [],
                failed: pdfPaths.map((p) => ({
                  path: p,
                  error: err instanceof Error ? err.message : String(err),
                })),
              });
            } finally {
              setImporting(false);
            }
            return;
          }

          setImporting(true);
          setResult(null);
          try {
            const summary = await api.importPdfFiles(pdfPaths);
            setResult(summary);
            if (summary.imported.length > 0) {
              qc.invalidateQueries({ queryKey: ["papers"] });
            }
          } catch (err) {
            setResult({
              imported: [],
              failed: pdfPaths.map((p) => ({
                path: p,
                error: err instanceof Error ? err.message : String(err),
              })),
            });
          } finally {
            setImporting(false);
          }
        }),
      );
    };

    setup();
    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [qc]);

  return { isDragging, importing, result, clearResult };
}
