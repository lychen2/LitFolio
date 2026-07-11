import { Clock, Filter, PenLine, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ReadStatus, Tag } from "@/lib/api";
import type { LibraryFilterState } from "./libraryFilters";

export type LibraryViewMode = "papers" | "queue";

export function LibraryFilterBar({
  viewMode,
  search,
  resultLabel,
  canReviewCollection,
  onSearchChange,
  onClearSearch,
  onToggleViewMode,
  filters,
  tagOptions,
  onFiltersChange,
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
  filters: LibraryFilterState;
  tagOptions: Tag[];
  onFiltersChange: (filters: LibraryFilterState) => void;
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
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <select
            value={filters.year}
            onChange={(event) => onFiltersChange({ ...filters, year: event.target.value })}
            className="litera-input text-xs w-24"
            aria-label={t("library.filterYear")}
          >
            <option value="">{t("library.filterYear")}</option>
            {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i)).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={filters.readStatus}
            onChange={(event) => onFiltersChange({ ...filters, readStatus: event.target.value as LibraryFilterState["readStatus"] })}
            className="litera-input text-xs w-28"
            aria-label={t("library.filterStatus")}
          >
            <option value="">{t("library.filterStatus")}</option>
            {(["unread", "reading", "read", "must"] satisfies ReadStatus[]).map((status) => (
              <option key={status} value={status}>{t(`common.${status}`)}</option>
            ))}
          </select>
          <select
            value={filters.tagId}
            onChange={(event) => onFiltersChange({ ...filters, tagId: event.target.value })}
            className="litera-input text-xs w-32"
            aria-label={t("library.filterTag")}
          >
            <option value="">{t("library.filterTag")}</option>
            {tagOptions.map((tag) => (
              <option key={tag.id} value={String(tag.id)}>{tag.name}</option>
            ))}
          </select>
          <Filter className="h-4 w-4 text-litera-mute" aria-hidden="true" />
        </div>
      )}
    </header>
  );
}
