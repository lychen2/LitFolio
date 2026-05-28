import { useEffect, type RefObject } from "react";

type PdfDropHandler = (paths: string[]) => void | Promise<void>;

interface PdfDropTarget {
  element: HTMLElement;
  onDrop: PdfDropHandler;
}

const targets = new Set<PdfDropTarget>();

export interface PdfDropPosition {
  x: number;
  y: number;
}

export function usePdfDropTarget(
  ref: RefObject<HTMLElement | null>,
  onDrop: PdfDropHandler,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const target = { element: ref.current, onDrop };
    targets.add(target);
    return () => {
      targets.delete(target);
    };
  }, [enabled, onDrop, ref]);
}

export function findPdfDropTarget(position: PdfDropPosition): PdfDropHandler | null {
  const orderedTargets = Array.from(targets).reverse();
  const target = orderedTargets.find((candidate) =>
    containsPoint(candidate.element.getBoundingClientRect(), position),
  );
  return target?.onDrop ?? null;
}

function containsPoint(rect: DOMRect, position: PdfDropPosition) {
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  );
}
