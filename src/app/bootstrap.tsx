import React from "react";
import ReactDOM from "react-dom/client";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import { AppRoot, createAppQueryClient } from "./AppRoot";

export function bootstrapApp(root: HTMLElement): void {
  const initialTheme = readStoredTheme();
  applyTheme(initialTheme);

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppRoot initialTheme={initialTheme} queryClient={createAppQueryClient()} />
    </React.StrictMode>,
  );
}
