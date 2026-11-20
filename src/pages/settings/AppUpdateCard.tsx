import { useEffect, useState } from "react";
import { XCircle, AlertTriangle, DownloadCloud, Spinner, RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import {
  UPDATE_STUCK_MS,
  type UpdateOutcome,
  type UpdateProgress,
} from "@/lib/autoUpdate";
import { checkForUpdatesFromSettings } from "@/plugins/updates/compatibility";

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
        await checkForUpdatesFromSettings(t, (next) => {
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
    <section className="litera-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 flex items-center gap-2 font-medium text-litera-text">
            <DownloadCloud className="size-4 text-litera-accent2" aria-hidden="true" />
            {t("update.section")}
          </h2>
          <p className="text-xs text-litera-mute">{t("update.sectionHint")}</p>
        </div>
        <Button size="sm"
          onClick={onCheck}
          disabled={checking}
        >
          {checking ? (
            <Spinner className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {checking ? t("update.checking") : t("update.check")}
        </Button>
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
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-litera-ink/70">
        <div
          className={`h-full rounded-full bg-litera-accent ${
            hasPercent ? "" : "animate-pulse"
          }`}
          style={{ width: hasPercent ? `${progress.percent}%` : "100%" }}
        />
      </div>
      {detail && <div className="mt-2 font-mono text-[11px]">{detail}</div>}
      {stalled && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--litera-radius)] border border-litera-warn/20 bg-litera-warn/5 px-3 py-2 text-litera-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
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
      <div role="alert" className="mt-3 text-xs text-litera-error">
        <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{t("update.failed", { message: outcome.message })}
      </div>
    );
  }
  const text = lineFor(outcome, t);
  if (!text) return null;
  return <div role="status" className="mt-3 text-xs text-litera-mute">{text}</div>;
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
