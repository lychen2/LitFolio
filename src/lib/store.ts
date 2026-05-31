import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UiState {
  threePane: { listW: number; notesW: number };
  setThreePane: (next: Partial<UiState["threePane"]>) => void;
}

export function mergeThreePane(
  current: UiState["threePane"],
  next: Partial<UiState["threePane"]>,
): UiState["threePane"] {
  return { ...current, ...next };
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      threePane: { listW: 280, notesW: 380 },
      setThreePane: (next) =>
        set((s) => ({ threePane: mergeThreePane(s.threePane, next) })),
    }),
    { name: "litera.ui" },
  ),
);
