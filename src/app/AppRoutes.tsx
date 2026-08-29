import { lazy, Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalOnboarding } from "@/components/GlobalOnboarding";
import { Shell } from "@/components/Shell";
import { PluginRouteHost } from "@/host/PluginRouteHost";
import { useT } from "@/i18n/I18nProvider";

// Route-level code splitting keeps the PDF rendering stack out of the initial
// library chunk until a paper is opened.
const LibraryPage = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const ReaderPage = lazy(() => import("@/pages/ReaderPage").then((m) => ({ default: m.ReaderPage })));
const ImportPage = lazy(() => import("@/pages/ImportPage").then((m) => ({ default: m.ImportPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

export function AppRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<RouteShell><LibraryPage /></RouteShell>} />
        <Route path="/reader/:paperId" element={<RouteShell><ReaderPage /></RouteShell>} />
        <Route path="/import" element={<RouteShell><ImportPage /></RouteShell>} />
        <Route path="/settings" element={<RouteShell><SettingsPage /></RouteShell>} />
        <Route path="*" element={<RouteShell><PluginRouteHost /></RouteShell>} />
      </Routes>
      <GlobalOnboarding />
    </Shell>
  );
}

function RouteShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <div className="h-full litera-fade-in">{children}</div>
      </Suspense>
    </ErrorBoundary>
  );
}

function RouteFallback() {
  const t = useT();
  return (
    <div className="h-full w-full grid place-items-center text-sm text-litera-mute">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("route.loading")}
      </div>
    </div>
  );
}
