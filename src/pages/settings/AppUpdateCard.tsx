import { useEffect, useState } from "react";
import { AlertTriangle, DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import {
  UPDATE_STUCK_MS,
  checkForUpdatesManually,
  type UpdateOutcome,
  type UpdateProgress,
} from "@/lib/autoUpdate";

type Translate = ReturnType<typeof useT>;
type TrackedUpdateProgress = UpdateProgress & { updatedAt: number };

export function AppUpdateCard() {
  const t = useT();
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<UpdateOutcome | null>(null);
  const [progress, setProgress] = useState<TrackedUpdateProgress | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!checking || !progress) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [checking, progress]);

  async function onCheck() {
    const startedAt = Date.now();
    setChecking(true);
    setOutcome(null);
    setNow(startedAt);
    setProgress({ stage: "checking", updatedAt: startedAt });
    try {
      setOutcome(
        await checkForUpdatesManually(t, (next) => {
          const updatedAt = Date.now();
          setNow(updatedAt);
          setProgress({ ...next, updatedAt });
        })
      );
    } finally {
      setChecking(false);
    }
  }

  const stalled =
    checking && progress ? now - progress.updatedAt >= UPDATE_STUCK_MS : false;

  return (
    <section className="litera-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-litera-text font-medium mb-1 flex items-center gap-2">
            <DownloadCloud className="h-4 w-4 text-litera-accent2" />
            {t("update.section")}
          </h3>
          <p className="text-xs text-litera-mute">{t("update.sectionHint")}</p>
        </div>
        <button
          onClick={onCheck}
          disabled={checking}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {checking ? t("update.checking") : t("update.check")}
        </button>
      </div>
      {checking && progress && (
        <UpdateProgressPanel progress={progress} stalled={stalled} t={t} />
      )}
      {!checking && outcome && <OutcomeLine outcome={outcome} />}
    </section>
  );
}

function UpdateProgressPanel({
  progress,
  stalled,
  t,
}: {
  progress: TrackedUpdateProgress;
  stalled: boolean;
  t: Translate;
}) {
  const hasPercent = typeof progress.percent === "number";
  const detail = progressDetail(progress, t);

  return (
    <div className="mt-4 rounded-[var(--litera-radius)] border border-litera-line bg-litera-ink/20 px-3 py-3 text-xs text-litera-mute">
      <div className="flex items-center justify-between gap-3">
        <div className="text-litera-text">
          {t(updateStageKey(progress.stage), {
            version: progress.version ?? "",
          })}
        </div>
        {hasPercent && (
          <div className="font-mono text-[11px] text-litera-mute">
            {progress.percent}%
          </div>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-litera-ink/70">
        <div
          className={`h-full rounded-full bg-litera-accent ${
            hasPercent ? "" : "animate-pulse"
          }`}
          style={{ width: hasPercent ? `${progress.percent}%` : "100%" }}
        />
      </div>
      {detail && <div className="mt-2 font-mono text-[11px]">{detail}</div>}
      {stalled && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--litera-radius)] border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-amber-100/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("update.stalled")}</span>
        </div>
      )}
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: UpdateOutcome }) {
  const t = useT();
  if (outcome.status === "error") {
    return (
      <div className="mt-3 text-xs text-red-400/90">
        ✕ {t("update.failed", { message: outcome.message })}
      </div>
    );
  }
  const text = lineFor(outcome, t);
  if (!text) return null;
  return <div className="mt-3 text-xs text-litera-mute">{text}</div>;
}

function lineFor(outcome: UpdateOutcome, t: Translate): string {
  switch (outcome.status) {
    case "updated":
      return t("update.installed");
    case "up-to-date":
      return t("update.upToDate");
    case "declined":
      return t("update.declined");
    case "unsupported":
      return t("update.unsupported");
    case "busy":
      return t("update.busy");
    case "error":
      return "";
  }
}

function updateStageKey(stage: UpdateProgress["stage"]): TKey {
  switch (stage) {
    case "checking":
      return "update.stage.checking";
    case "available":
      return "update.stage.available";
    case "downloading":
      return "update.stage.downloading";
    case "installing":
      return "update.stage.installing";
    case "relaunching":
      return "update.stage.relaunching";
  }
}

function progressDetail(progress: UpdateProgress, t: Translate): string {
  if (
    progress.totalBytes &&
    typeof progress.downloadedBytes === "number" &&
    typeof progress.percent === "number"
  ) {
    return t("update.progressBytes", {
      downloaded: formatBytes(progress.downloadedBytes),
      total: formatBytes(progress.totalBytes),
      percent: progress.percent,
    });
  }
  if (
    typeof progress.downloadedBytes === "number" &&
    progress.downloadedBytes > 0
  ) {
    return t("update.progressDownloaded", {
      downloaded: formatBytes(progress.downloadedBytes),
    });
  }
  if (progress.stage === "downloading") return t("update.progressUnknown");
  return "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
