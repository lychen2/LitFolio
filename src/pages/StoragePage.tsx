import { useQuery } from "@tanstack/react-query";
import { Database, FileText, HardDrive, Paperclip, StickyNote } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function StatCard({
  icon: Icon,
  label,
  bytes,
  accent,
}: {
  icon: typeof HardDrive;
  label: string;
  bytes: number;
  accent: string;
}) {
  return (
    <div className="bg-litera-panel/50 border border-litera-line rounded-xl p-5 flex items-start gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
      >
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-litera-text font-medium">{label}</div>
        <div className="text-2xl font-semibold text-litera-text mt-1 tabular-nums">
          {fmtBytes(bytes)}
        </div>
      </div>
    </div>
  );
}

export function StoragePage() {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ["storage-stats"],
    queryFn: api.storageStats,
    refetchOnMount: true,
    staleTime: 30_000,
  });

  const total = data
    ? data.papers_bytes +
      data.notes_bytes +
      data.attachments_bytes +
      data.vectors_bytes +
      data.database_bytes
    : 0;

  return (
    <section className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <h1 className="text-lg font-semibold text-litera-text">
          {t("storage.title")}
        </h1>
        <p className="text-sm text-litera-mute mt-1">{t("storage.subtitle")}</p>

        {error && (
          <div className="mt-6 p-4 rounded-lg bg-litera-error/10 border border-litera-error/20 text-sm text-litera-error">
            {t("storage.loadFailed", { message: error.message })}
          </div>
        )}

        {isLoading && (
          <div className="mt-6 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-litera-panel/30 border border-litera-line rounded-xl p-5 animate-pulse"
              >
                <div className="h-4 w-24 bg-litera-line rounded mb-3" />
                <div className="h-7 w-20 bg-litera-line rounded" />
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
              <StatCard
                icon={FileText}
                label={t("storage.papers")}
                bytes={data.papers_bytes}
                accent="var(--litera-info)"
              />
              <StatCard
                icon={StickyNote}
                label={t("storage.notes")}
                bytes={data.notes_bytes}
                accent="var(--litera-warn)"
              />
              <StatCard
                icon={Paperclip}
                label={t("storage.attachments")}
                bytes={data.attachments_bytes}
                accent="var(--litera-accent)"
              />
              <StatCard
                icon={HardDrive}
                label={t("storage.vectors")}
                bytes={data.vectors_bytes}
                accent="var(--litera-success)"
              />
              <StatCard
                icon={Database}
                label={t("storage.database")}
                bytes={data.database_bytes}
                accent="var(--litera-accent2)"
              />
            </div>

            <div className="mt-4 bg-litera-panel/50 border border-litera-line rounded-xl p-5 flex items-center justify-between">
              <span className="text-sm text-litera-text font-medium">
                {t("storage.total")}
              </span>
              <span className="text-xl font-semibold text-litera-text tabular-nums">
                {fmtBytes(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
