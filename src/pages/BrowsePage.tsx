import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Atom, Spinner, RefreshCw, Search, ChevronDown, ChevronRight,
  ChevronsDown, PanelLeft, X,
  XCircle,
} from "@/components/icons";
import { api } from "@/lib/api";
import type { ArxivDraft, TranslationResult } from "@/lib/api";
import { draftTranslationKey, setDraftTranslation } from "./browse/draftTranslations";
import { ARXIV_GROUPS, findCategoryLabel } from "@/lib/arxiv-categories";
import { DraftDetailDrawer } from "./browse/DraftDetailDrawer";
import { DraftRow } from "./browse/DraftRow";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { PageHeader } from "@/components/PageHeader";
import { PageToolbar } from "@/components/PageToolbar";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import "./browse/browseDiscovery.css";

const DEFAULT_CATEGORY = "physics.optics";
const PAGE_SIZE = 50;
const RECENT_CATEGORY_LIMIT = 4;

export function BrowsePage() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [categoryInput, setCategoryInput] = useState(DEFAULT_CATEGORY);
  const [recentCategories, setRecentCategories] = useState([DEFAULT_CATEGORY]);
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["Physics"]));
  const [categoryOpen, setCategoryOpen] = useState(false);
  const isCompact = useNarrowLayout(901);
  useEffect(() => {
    if (!categoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setCategoryOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [categoryOpen]);

  const queryClient = useQueryClient();
  const queryKey = ["arxiv-browse", category];
  const results = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.arxivListCategory(category, PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, _pages, offset) => lastPage.length === PAGE_SIZE ? offset + lastPage.length : undefined,
    staleTime: Infinity,
    retry: false,
  });
  const drafts = results.data?.pages.flat() ?? [];
  const exhausted = results.isSuccess && !results.hasNextPage;
  const [preview, setPreview] = useState<ArxivDraft | null>(null);
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const translationTargetLang = llmLanguageNameFor(lang);

  function selectCategory(input: string) {
    const next = input.trim();
    if (!next) return;
    setCategory(next);
    setCategoryInput(next);
    setCategoryOpen(false);
    setPreview(null);
    setRecentCategories((recent) => {
      if (recent[0] === next) return recent;
      return [next, ...recent.filter((id) => id !== next)].slice(0, RECENT_CATEGORY_LIMIT);
    });
  }

  const keyword = filter.trim();
  const filterPattern = keyword ? new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu") : null;
  const filtered = filterPattern
    ? drafts.filter((draft) =>
        draft.title.search(filterPattern) !== -1 ||
        draft.authors.some((author) => author.search(filterPattern) !== -1) ||
        (draft.abstract_text?.search(filterPattern) ?? -1) !== -1,
      )
    : drafts;

  function toggleGroup(label: string) {
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label); else n.add(label);
      return n;
    });
  }

  function applyTranslation(draft: ArxivDraft, result: TranslationResult) {
    setTranslations((current) => setDraftTranslation(current, draft, result));
  }

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <div className="relative flex flex-1 overflow-hidden">
      {categoryOpen && <button type="button" aria-label={t("common.close")} onClick={() => setCategoryOpen(false)} className="absolute inset-0 z-20 hidden bg-litera-ink/45 max-[900px]:block" />}
      {/* sidebar: category tree */}
      {(!isCompact || categoryOpen) && (
      <aside
        className={`w-[240px] shrink-0 overflow-auto border-r border-litera-border bg-litera-paper/35 motion-safe:transition-transform motion-safe:duration-200 max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[270px] max-[900px]:max-w-full max-[900px]:bg-litera-paper max-[900px]:shadow-2xl ${categoryOpen ? "max-[900px]:translate-x-0" : "max-[900px]:-translate-x-full"}`}
      >
        <div className="hidden items-center justify-between border-b border-litera-border px-3 py-2 max-[900px]:flex">
          <span className="litera-section-label">{t("browse.categories")}</span>
          <button type="button" onClick={() => setCategoryOpen(false)} className="litera-icon-btn h-7 w-7" aria-label={t("common.close")} title={t("common.close")}><X className="h-3.5 w-3.5" /></button>
        </div>
        <form
          className="border-b border-litera-border px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            selectCategory(categoryInput);
          }}
        >
          <div className="flex items-center gap-1">
            <input
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.currentTarget.value)}
              aria-label={t("browse.categoryHint")}
              placeholder="cs.LG, physics.optics, …"
              className="litera-input min-w-0 flex-1 px-2 text-xs font-mono"
            />
            <button type="submit" className="litera-btn shrink-0 text-xs" disabled={!categoryInput.trim()}>
              {lang === "zh" ? "打开" : "Open"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-litera-mute">{t("browse.categoryHint")}</p>
        </form>
        <nav className="px-2 py-2">
          {ARXIV_GROUPS.map((g) => {
            const open = openGroups.has(g.label);
            return (
              <div key={g.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(g.label)}
                  className="flex items-center gap-1 w-full px-2 py-1 text-xs text-litera-text/80 hover:text-litera-text"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="font-medium uppercase tracking-wider text-[10px]">{g.label}</span>
                </button>
                {open && (
                  <ul className="ml-3 mt-0.5 space-y-0.5">
                    {g.categories.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectCategory(c.id)}
                          aria-current={c.id === category ? "true" : undefined}
                          className={
                            "block w-full text-left px-2 py-1 rounded text-[12px] transition-colors " +
                            (c.id === category
                              ? "bg-litera-accent/12 text-litera-accent"
                              : "text-litera-mute hover:bg-litera-surface2 hover:text-litera-text")
                          }
                          title={c.id}
                        >
                          {c.label}
                          <span className="ml-1.5 text-[10px] text-litera-mute font-mono">{c.id.split(".").pop()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      )}

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          icon={<Atom />}
          title={<>{findCategoryLabel(category)} <span className="font-mono text-xs font-normal text-litera-mute">/ {category}</span></>}
          subtitle={t("browse.subtitle")}
        />
        <PageToolbar>
          <button type="button" onClick={() => setCategoryOpen((open) => !open)} className="litera-btn hidden text-xs max-[900px]:inline-flex" title={t("browse.categories")} aria-label={t("browse.categories")}>
            <PanelLeft className="h-3.5 w-3.5" />
            <span>{t("browse.categories")}</span>
          </button>
          <div className="relative max-w-full">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-litera-mute" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t("browse.filterPlaceholder")}
              placeholder={t("browse.filterPlaceholder")}
              className="litera-input pl-7 w-48 max-w-full text-xs"
            />
          </div>
          <span className="text-[11px] text-litera-mute font-mono">
            {t("browse.loaded", { count: drafts.length })}{exhausted ? ` ${t("browse.exhausted")}` : ""}
          </span>
          <button type="button" onClick={() => void queryClient.resetQueries({ queryKey, exact: true })} disabled={results.isFetching} className="litera-btn text-xs disabled:opacity-50">
            {results.isPending ? <Spinner className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t("common.refresh")}
          </button>
        </PageToolbar>
        {recentCategories.length > 1 && (
          <div role="group" aria-labelledby="browse-recent-categories" className="browse-recent-categories">
            <span id="browse-recent-categories" className="litera-section-label">
              {lang === "zh" ? "最近分类" : "Recent categories"}
            </span>
            {recentCategories.map((id) => (
              <button
                key={id}
                type="button"
                className="browse-recent-category litera-btn font-mono text-xs"
                aria-pressed={id === category}
                title={findCategoryLabel(id)}
                onClick={() => selectCategory(id)}
              >
                {id}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {results.isPending ? (
            <div role="status" className="grid place-items-center h-64 text-sm text-litera-mute">
              <div className="flex items-center gap-2"><Spinner className="h-4 w-4 motion-safe:animate-spin" /> {t("browse.fetching", { category })}</div>
            </div>
          ) : results.isError && drafts.length === 0 ? (
            <div role="alert" className="p-6 text-sm text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{results.error.message}</div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center h-64 text-sm text-litera-mute">
              {filterPattern ? t("browse.noMatchFiltered") : t("browse.noResults")}
            </div>
          ) : (
            <ul className="divide-y divide-litera-line">
              {filtered.map((draft, index) => (
                <DraftRow
                  key={(draft.arxiv_id ?? "") + index}
                  draft={draft}
                  filterPattern={filterPattern}
                  rank={index + 1}
                  translation={translations.get(draftTranslationKey(draft, translationTargetLang)) ?? null}
                  onTranslated={(result) => applyTranslation(draft, result)}
                  onOpen={() => setPreview(draft)}
                />
              ))}
            </ul>
          )}
          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 p-4">
              {exhausted ? (
                <span className="text-xs italic text-litera-mute">{t("browse.loadedAll", { count: drafts.length })}</span>
              ) : results.hasNextPage && (
                <button type="button" onClick={() => void results.fetchNextPage()} disabled={results.isFetching} className="litera-btn text-xs disabled:opacity-50">
                  {results.isFetchingNextPage ? <Spinner className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <ChevronsDown className="h-3.5 w-3.5" />}
                  {results.isFetchingNextPage ? t("common.loading") : t("browse.loadMore", { count: PAGE_SIZE })}
                </button>
              )}
              {results.isFetchNextPageError && (
                <span role="alert" className="text-xs text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{results.error.message}</span>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
      {preview && (
        <DraftDetailDrawer
          draft={preview}
          translation={translations.get(draftTranslationKey(preview, translationTargetLang)) ?? null}
          onTranslated={(result) => applyTranslation(preview, result)}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
