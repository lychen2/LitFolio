import { useQuery } from "@tanstack/react-query";
import { LibraryBig } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ImportSidebar() {
  const t = useT();
  const recent = useQuery({
    queryKey: ["papers", "recent", "import-sidebar"],
    queryFn: () => api.papersRecent(6),
    refetchInterval: 8000,
  });

  return (
    <aside>
      <section className="litera-panel p-4">
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-3 flex items-center gap-1.5">
          <LibraryBig className="h-3.5 w-3.5 text-litera-accent" />
          {t("import.sidebar.recent")}
        </div>
        {recent.isLoading ? (
          <div className="text-xs text-litera-mute">{t("import.sidebar.recentLoading")}</div>
        ) : !recent.data || recent.data.length === 0 ? (
          <div className="text-xs text-litera-mute">{t("import.sidebar.recentEmpty")}</div>
        ) : (
          <div className="space-y-3">
            {recent.data.map((paper) => (
              <article key={paper.id} className="border border-litera-line/70 rounded-lg p-3 bg-litera-ink/15">
                <div className="text-sm text-litera-text leading-snug">{paper.title}</div>
                <div className="mt-1 text-[11px] text-litera-mute">
                  {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 ? " et al." : ""}
                  {paper.year ? ` · ${paper.year}` : ""}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
