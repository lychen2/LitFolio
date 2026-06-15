import { Clock, PenLine, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export type LibraryViewMode = "papers" | "queue";

export function LibraryFilterBar({
  viewMode,
  search,
  resultLabel,
  canReviewCollection,
  onSearchChange,
  onClearSearch,
  onToggleViewMode,
  onReviewCollection,
}: {
  viewMode: LibraryViewMode;
  search: string;
  resultLabel: string;
  canReviewCollection: boolean;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onToggleViewMode: () => void;
  onReviewCollection: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-4">
      <div className="min-w-0 flex items-center gap-3">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">
            {viewMode === "queue" ? t("queue.title") : t("library.title")}
          </h1>
          <p className="text-sm text-litera-mute">{resultLabel}</p>
        </div>
        <button
          onClick={onToggleViewMode}
          className={`litera-btn text-xs ${viewMode === "queue" ? "bg-litera-accent/15 text-litera-accent border-litera-accent/30" : ""}`}
          title={t("queue.title")}
          aria-label={t("queue.title")}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        {canReviewCollection && (
          <button
            onClick={onReviewCollection}
            className="litera-btn text-xs"
            title={t("litReview.title")}
            aria-label={t("litReview.title")}
          >
            <PenLine className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {viewMode === "papers" && (
        <div className="relative w-80 max-w-[40vw]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-litera-mute" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("library.searchPlaceholder")}
            aria-label={t("library.searchPlaceholder")}
            className="litera-input pl-9 pr-8 w-full"
          />
          {search && (
            <button
              onClick={onClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute hover:text-litera-text"
              aria-label={t("common.cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </header>
  );
}
