import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clock, Filter, PanelLeft, PenLine, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ReadStatus, Tag } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { PageToolbar } from "@/components/PageToolbar";
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
  onToggleFolders = () => undefined,
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
  onToggleFolders?: () => void;
  onReviewCollection: () => void;
  filters: LibraryFilterState;
  tagOptions: Tag[];
  onFiltersChange: (filters: LibraryFilterState) => void;
}) {
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFiltersOpen(false);
      requestAnimationFrame(() => filterButtonRef.current?.focus());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtersOpen]);
  const activeFilters = [
    filters.year && { key: "year", label: filters.year },
    filters.readStatus && { key: "readStatus", label: t(`common.${filters.readStatus}` as Parameters<typeof t>[0]) },
    filters.tagId && { key: "tagId", label: tagOptions.find((tag) => String(tag.id) === filters.tagId)?.name ?? filters.tagId },
  ].filter(Boolean) as Array<{ key: keyof LibraryFilterState; label: string }>;

  function clearFilter(key: keyof LibraryFilterState) {
    onFiltersChange({ ...filters, [key]: "" });
  }

  return (
    <>
      <PageHeader
        title={viewMode === "queue" ? t("queue.title") : t("library.title")}
        subtitle={resultLabel}
        actions={(
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleViewMode}
              className={`litera-btn text-xs ${viewMode === "queue" ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent" : ""}`}
              title={t("queue.title")}
              aria-label={t("queue.title")}
              aria-pressed={viewMode === "queue"}
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("queue.title")}</span>
            </button>
            {canReviewCollection && (
              <button onClick={onReviewCollection} className="litera-btn text-xs" title={t("litReview.title")} aria-label={t("litReview.title")}>
                <PenLine className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("litReview.title")}</span>
              </button>
            )}
          </div>
        )}
      />
      {viewMode === "papers" && (
        <PageToolbar>
          <span className="sr-only">
            {t("library.filterYear")} {t("library.filterStatus")} {t("library.filterTag")}
          </span>
          <button type="button" onClick={onToggleFolders} className="litera-btn hidden shrink-0 text-xs max-[900px]:inline-flex" title={t("folders.title")} aria-label={t("folders.title")}>
            <PanelLeft className="h-3.5 w-3.5" />
            <span>{t("folders.title")}</span>
          </button>
          <div className="relative min-w-[180px] flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-litera-mute" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("library.searchPlaceholder")}
              aria-label={t("library.searchPlaceholder")}
              className="litera-input w-full pl-9 pr-8"
            />
            {search && (
              <button onClick={onClearSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute hover:text-litera-text" aria-label={t("common.cancel")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <button
              ref={filterButtonRef}
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={`litera-btn text-xs ${activeFilters.length > 0 ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent" : ""}`}
              aria-expanded={filtersOpen}
              aria-controls="library-filter-popover"
            >
              <Filter className="h-3.5 w-3.5" />
              {t("library.filters")}
              {activeFilters.length > 0 && <span className="rounded-full bg-litera-accent px-1.5 text-[10px] text-litera-ink">{activeFilters.length}</span>}
            </button>
            {filtersOpen && (
              <div id="library-filter-popover" className="litera-overlay absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-64 p-3 space-y-3">
                <FilterField label={t("library.filterYear")}>
                  <select value={filters.year} onChange={(event) => onFiltersChange({ ...filters, year: event.target.value })} className="litera-input w-full text-xs">
                    <option value="">{t("library.filterYear")}</option>
                    {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i)).map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </FilterField>
                <FilterField label={t("library.filterStatus")}>
                  <select value={filters.readStatus} onChange={(event) => onFiltersChange({ ...filters, readStatus: event.target.value as LibraryFilterState["readStatus"] })} className="litera-input w-full text-xs">
                    <option value="">{t("library.filterStatus")}</option>
                    {(["unread", "reading", "read", "must"] satisfies ReadStatus[]).map((status) => <option key={status} value={status}>{t(`common.${status}`)}</option>)}
                  </select>
                </FilterField>
                <FilterField label={t("library.filterTag")}>
                  <select value={filters.tagId} onChange={(event) => onFiltersChange({ ...filters, tagId: event.target.value })} className="litera-input w-full text-xs">
                    <option value="">{t("library.filterTag")}</option>
                    {tagOptions.map((tag) => <option key={tag.id} value={String(tag.id)}>{tag.name}</option>)}
                  </select>
                </FilterField>
              </div>
            )}
          </div>
          {activeFilters.map((filter) => (
            <button key={filter.key} onClick={() => clearFilter(filter.key)} className="inline-flex items-center gap-1 rounded-full border border-litera-accent/45 bg-litera-accent/10 px-2 py-1 text-[11px] text-litera-accent" title={t("common.cancel")}>
              {filter.label}<X className="h-3 w-3" />
            </button>
          ))}
        </PageToolbar>
      )}
    </>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="litera-section-label">{label}</span>{children}</label>;
}
