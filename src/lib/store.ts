import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UiState {
  threePane: { listW: number; notesW: number };
  setThreePane: (next: Partial<UiState["threePane"]>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      threePane: { listW: 280, notesW: 380 },
      setThreePane: (next) =>
        set((s) => ({ threePane: { ...s.threePane, ...next } })),
    }),
    { name: "litera.ui" },
  ),
);
