import { Routes, Route, Navigate } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { LibraryPage } from "@/pages/LibraryPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { ImportPage } from "@/pages/ImportPage";
import { AskPage } from "@/pages/AskPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TopicPage } from "@/pages/TopicPage";
import { BrowsePage } from "@/pages/BrowsePage";
import { FeedsPage } from "@/pages/FeedsPage";

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/reader/:paperId" element={<ReaderPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/topic" element={<TopicPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/feeds" element={<FeedsPage />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Shell>
  );
}
