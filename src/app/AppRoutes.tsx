import { lazy, Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalOnboarding } from "@/components/GlobalOnboarding";
import { Shell } from "@/components/Shell";
import { useT } from "@/i18n/I18nProvider";

// Route-level code splitting keeps the PDF rendering stack out of the initial
// library chunk until a paper is opened.
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
const CandidateInboxPage = lazy(() => import("@/pages/CandidateInboxPage").then((m) => ({ default: m.CandidateInboxPage })));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));

export function AppRoutes() {
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
        <Route path="/candidates" element={<RouteShell><CandidateInboxPage /></RouteShell>} />
        <Route path="/projects" element={<RouteShell><ProjectsPage /></RouteShell>} />
        <Route path="/ask" element={<RouteShell><AskPage /></RouteShell>} />
        <Route path="/graph" element={<RouteShell><GraphPage /></RouteShell>} />
        <Route path="/compare" element={<RouteShell><ComparePage /></RouteShell>} />
        <Route path="/settings" element={<RouteShell><SettingsPage /></RouteShell>} />
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
