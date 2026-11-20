import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { BookOpenText, Search } from "@/components/icons";
import { TopicSurveyView } from "./topic/TopicSurveyView";
import { TopicSearchView } from "./topic/TopicSearchView";
import { useT } from "@/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { PageToolbar } from "@/components/PageToolbar";

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
    <Tabs.Root value={tab} onValueChange={(value) => setTab(value === "search" ? "search" : "survey")} className="flex h-full flex-col">
      <PageHeader
        icon={tab === "survey" ? <BookOpenText /> : <Search />}
        title={t(tab === "survey" ? "topic.survey.heading" : "topic.search.heading")}
        subtitle={t(tab === "survey" ? "topic.survey.subtitle" : "topic.search.subtitle")}
      />
      <PageToolbar>
        <Tabs.List className="litera-tab-list max-w-full flex-wrap" aria-label={t("nav.topic")}>
          <Tabs.Trigger value="survey" className="litera-tab">
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            {t("topic.tab.survey")}
          </Tabs.Trigger>
          <Tabs.Trigger value="search" className="litera-tab">
            <Search className="h-4 w-4" />
            {t("topic.tab.search")}
          </Tabs.Trigger>
        </Tabs.List>
      </PageToolbar>
      <Tabs.Content value="survey" className="litera-tab-panel min-h-0 flex-1">
        <TopicSurveyView />
      </Tabs.Content>
      <Tabs.Content value="search" className="litera-tab-panel min-h-0 flex-1">
        <TopicSearchView />
      </Tabs.Content>
    </Tabs.Root>
  );
}
