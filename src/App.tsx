import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Shell } from "@/components/Shell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useT } from "@/i18n/I18nProvider";

// Route-level code splitting: each page is its own chunk. Loads the PDF
// rendering stack (react-pdf-highlighter + pdfjs-dist, ~1MB gzipped) only
// when the user actually opens a paper, instead of pulling it into the
// initial bundle alongside the library list.
const LibraryPage = lazy(() => import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const ReaderPage = lazy(() => import("@/pages/ReaderPage").then((m) => ({ default: m.ReaderPage })));
const ImportPage = lazy(() => import("@/pages/ImportPage").then((m) => ({ default: m.ImportPage })));
const AskPage = lazy(() => import("@/pages/AskPage").then((m) => ({ default: m.AskPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const TopicPage = lazy(() => import("@/pages/TopicPage").then((m) => ({ default: m.TopicPage })));
const BrowsePage = lazy(() => import("@/pages/BrowsePage").then((m) => ({ default: m.BrowsePage })));
const FeedsPage = lazy(() => import("@/pages/FeedsPage").then((m) => ({ default: m.FeedsPage })));
const GraphPage = lazy(() => import("@/pages/GraphPage").then((m) => ({ default: m.GraphPage })));
const ComparePage = lazy(() => import("@/pages/ComparePage").then((m) => ({ default: m.ComparePage })));

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<RouteShell><LibraryPage /></RouteShell>} />
        <Route path="/reader/:paperId" element={<RouteShell><ReaderPage /></RouteShell>} />
        <Route path="/import" element={<RouteShell><ImportPage /></RouteShell>} />
        <Route path="/topic" element={<RouteShell><TopicPage /></RouteShell>} />
        <Route path="/browse" element={<RouteShell><BrowsePage /></RouteShell>} />
        <Route path="/feeds" element={<RouteShell><FeedsPage /></RouteShell>} />
        <Route path="/ask" element={<RouteShell><AskPage /></RouteShell>} />
        <Route path="/graph" element={<RouteShell><GraphPage /></RouteShell>} />
        <Route path="/compare" element={<RouteShell><ComparePage /></RouteShell>} />
        <Route path="/settings" element={<RouteShell><SettingsPage /></RouteShell>} />
      </Routes>
    </Shell>
  );
}

// Wraps every route in an ErrorBoundary (so one page throwing doesn't blank
// the shell) and a Suspense (so React.lazy chunks have a fallback).
function RouteShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
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
