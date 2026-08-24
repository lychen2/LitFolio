import { useEffect, useState, type ReactNode } from "react";
import { FileText, Languages, Orbit } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { NoteSectionsPane } from "./NoteSectionsPane";
import { SelectionTranslatePane } from "./SelectionTranslatePane";
import { TermsPane } from "./TermsPane";
import { cn } from "@/lib/cn";

export type ReaderWorkspaceTab = "notes" | "translate" | "terms";

export function ReaderWorkspacePane({
  paperId,
  activeTab,
  onTabChange,
  onSelectionSetterReady,
}: {
  paperId: string;
  activeTab: ReaderWorkspaceTab;
  onTabChange: (tab: ReaderWorkspaceTab) => void;
  /// Called once on mount with this pane's setSelectionText. ReaderPage
  /// stashes the setter in a ref so PdfPane can push selections in without
  /// changing any prop on ReaderPage — keeping the PDF pane from re-rendering
  /// every time the user selects text.
  onSelectionSetterReady?: (setter: (text: string) => void) => void;
}) {
  const t = useT();
  const [selectionText, setSelectionText] = useState("");

  useEffect(() => {
    onSelectionSetterReady?.(setSelectionText);
  }, [onSelectionSetterReady]);

  return (
    <div className="reader-workspace h-full flex flex-col bg-litera-paper/30">
      <div className="reader-panel-header">
        <span className="litera-section-label">{t("reader.workspace")}</span>
        <div className="flex items-center gap-1.5">
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
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className={cn("h-full", activeTab !== "notes" && "hidden")}>
          <NoteSectionsPane paperId={paperId} />
        </div>
        <div className={cn("h-full absolute inset-0", activeTab !== "translate" && "hidden")}>
          <SelectionTranslatePane paperId={paperId} selectionText={selectionText} />
        </div>
        <div className={cn("h-full absolute inset-0", activeTab !== "terms" && "hidden")}>
          <TermsPane paperId={paperId} />
        </div>
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
        "inline-flex min-h-7 items-center gap-1 rounded-[var(--litera-radius)] border px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-litera-focus",
        active
          ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent"
          : "border-transparent text-litera-mute hover:bg-litera-surface2 hover:text-litera-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
