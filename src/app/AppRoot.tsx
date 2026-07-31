import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { ThemeId } from "@/lib/theme";
import { AppRoutes } from "./AppRoutes";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
}

export function AppRoot({
  initialTheme,
  queryClient,
}: {
  initialTheme: ThemeId;
  queryClient: QueryClient;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
