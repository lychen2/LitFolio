import { useEffect, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import { TopicSurveyView } from "./topic/TopicSurveyView";
import { TopicSearchView } from "./topic/TopicSearchView";

const TAB_KEY = "litera-topic-tab";
type Tab = "survey" | "search";

export function TopicPage() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(TAB_KEY) : null;
    return saved === "search" ? "search" : "survey";
  });

  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* private mode etc. */ }
  }, [tab]);

  return (
    <div className="h-full flex flex-col">
      <nav className="px-6 pt-3 flex gap-1 border-b border-litera-line bg-litera-paper">
        <TabBtn
          active={tab === "survey"}
          onClick={() => setTab("survey")}
          icon={<BookOpenText className="h-4 w-4" />}
        >
          📚 综述生成
        </TabBtn>
        <TabBtn
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Search className="h-4 w-4" />}
        >
          🔍 搜索召回
        </TabBtn>
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "survey" ? <TopicSurveyView /> : <TopicSearchView />}
      </div>
    </div>
  );
}

function TabBtn({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors " +
        (active
          ? "border-litera-accent text-litera-text"
          : "border-transparent text-litera-mute hover:text-litera-text")
      }
    >
      {icon}
      {children}
    </button>
  );
}
