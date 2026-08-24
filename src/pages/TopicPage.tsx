import { useEffect, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import { TopicSurveyView } from "./topic/TopicSurveyView";
import { TopicSearchView } from "./topic/TopicSearchView";
import { useT } from "@/i18n/I18nProvider";

const TAB_KEY = "litera-topic-tab";
type Tab = "survey" | "search";

export function TopicPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(TAB_KEY) : null;
    return saved === "search" ? "search" : "survey";
  });

  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* private mode etc. */ }
  }, [tab]);

  return (
    <div className="h-full flex flex-col">
      <nav className="flex gap-1 border-b border-litera-border bg-litera-paper/55 px-5 py-2" role="tablist" aria-label={t("nav.topic")}>
        <TabBtn
          active={tab === "survey"}
          onClick={() => setTab("survey")}
          icon={<BookOpenText className="h-4 w-4" />}
        >
          {t("topic.tab.survey")}
        </TabBtn>
        <TabBtn
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Search className="h-4 w-4" />}
        >
          {t("topic.tab.search")}
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
      role="tab"
      aria-selected={active}
      className={
        "flex min-h-8 items-center gap-2 rounded-[var(--litera-radius)] border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-litera-focus " +
        (active
          ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent"
          : "border-transparent text-litera-mute hover:bg-litera-surface2 hover:text-litera-text")
      }
    >
      {icon}
      {children}
    </button>
  );
}
