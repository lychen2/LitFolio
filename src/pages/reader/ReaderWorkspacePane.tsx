import type { ReactNode } from "react";
import { FileText, Languages, Orbit } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { NotesPane } from "./NotesPane";
import { SelectionTranslatePane } from "./SelectionTranslatePane";
import { TermsPane } from "./TermsPane";
import { cn } from "@/lib/cn";

export type ReaderWorkspaceTab = "notes" | "translate" | "terms";

export function ReaderWorkspacePane({
  paperId,
  activeTab,
  selectionText,
  onTabChange,
}: {
  paperId: string;
  activeTab: ReaderWorkspaceTab;
  selectionText: string;
  onTabChange: (tab: ReaderWorkspaceTab) => void;
}) {
  const t = useT();
  return (
    <div className="h-full flex flex-col bg-litera-paper/30">
      <div className="px-2 py-2 border-b border-litera-line flex items-center gap-1.5">
        <TabButton
          active={activeTab === "notes"}
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t("reader.tabNotes")}
          onClick={() => onTabChange("notes")}
        />
        <TabButton
          active={activeTab === "translate"}
          icon={<Languages className="h-3.5 w-3.5" />}
          label={t("reader.tabTranslate")}
          onClick={() => onTabChange("translate")}
        />
        <TabButton
          active={activeTab === "terms"}
          icon={<Orbit className="h-3.5 w-3.5" />}
          label={t("reader.tabTerms")}
          onClick={() => onTabChange("terms")}
        />
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "notes" ? (
          <NotesPane paperId={paperId} />
        ) : activeTab === "terms" ? (
          <TermsPane paperId={paperId} />
        ) : (
          <SelectionTranslatePane paperId={paperId} selectionText={selectionText} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-litera-accent/15 text-litera-accent border border-litera-accent/30"
          : "text-litera-mute border border-transparent hover:bg-litera-panel hover:text-litera-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
