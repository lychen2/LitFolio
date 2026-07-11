export type ReaderMainMode = "pdf" | "native";

export type HighlightJumpDecision = {
  mode: ReaderMainMode;
  pendingJumpId: string | null;
  scrollNow: boolean;
};

export function resolveHighlightJump({
  mode,
  highlightId,
  canScroll,
}: {
  mode: ReaderMainMode;
  highlightId: string;
  canScroll: boolean;
}): HighlightJumpDecision {
  if (mode !== "pdf") {
    return { mode: "pdf", pendingJumpId: highlightId, scrollNow: false };
  }
  if (!canScroll) {
    return { mode: "pdf", pendingJumpId: highlightId, scrollNow: false };
  }
  return { mode: "pdf", pendingJumpId: null, scrollNow: true };
}
