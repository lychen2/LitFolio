import type { TKey } from "@/i18n/dict";
import type { I18nVars } from "@/i18n/format";
import { errorMessage } from "./error";

type Translator = (key: TKey, vars?: I18nVars) => string;

export type UpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export type UpdateProgressStage =
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "relaunching";

export interface UpdateProgress {
  stage: UpdateProgressStage;
  version?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number;
}

type UpdateProgressHandler = (progress: UpdateProgress) => void;

export interface UpdateHandle {
  version: string;
  downloadAndInstall: (
    onEvent?: (event: UpdateDownloadEvent) => void
  ) => Promise<void>;
}

export type UpdateOutcome =
  | { status: "updated"; version: string }
  | { status: "declined"; version: string }
  | { status: "up-to-date" }
  | { status: "unsupported" }
  | { status: "busy" }
  | { status: "error"; message: string };

export interface RunUpdateOptions {
  prompt: boolean;
  onProgress?: UpdateProgressHandler;
}

export interface UpdateDeps {
  isTauri: () => boolean;
  check: () => Promise<UpdateHandle | null>;
  confirm: (message: string, title: string) => Promise<boolean>;
  notify: (message: string, title: string) => Promise<void>;
  relaunch: () => Promise<void>;
  t: Translator;
  log: (message: string) => void;
}

export const UPDATE_STUCK_MS = 60_000;

// Single-flight guard: the updater plugin is process-global, so overlapping
// checks (startup vs. periodic vs. a manual click) would race the download.
let inFlight = false;

export async function runUpdateCheck(
  deps: UpdateDeps,
  options: RunUpdateOptions
): Promise<UpdateOutcome> {
  if (!deps.isTauri()) return { status: "unsupported" };
  if (inFlight) return { status: "busy" };
  inFlight = true;
  try {
    options.onProgress?.({ stage: "checking" });
    return await drive(deps, options);
  } catch (error) {
    // The whole point of this rewrite: never swallow the reason. Surface it to
    // the caller (Settings shows it) and log it so it is not lost.
    const message = errorMessage(error);
    deps.log(`update check failed: ${message}`);
    return { status: "error", message };
  } finally {
    inFlight = false;
  }
}

async function drive(
  deps: UpdateDeps,
  options: RunUpdateOptions
): Promise<UpdateOutcome> {
  const update = await deps.check();
  if (!update) return { status: "up-to-date" };

  const title = deps.t("update.title");
  options.onProgress?.({ stage: "available", version: update.version });
  if (options.prompt) {
    const accepted = await deps.confirm(
      deps.t("update.available", { version: update.version }),
      title
    );
    if (!accepted) return { status: "declined", version: update.version };
  }

  options.onProgress?.({
    stage: "downloading",
    version: update.version,
    downloadedBytes: 0,
  });
  await update.downloadAndInstall(
    createDownloadProgressReporter(update.version, options.onProgress)
  );
  options.onProgress?.({ stage: "relaunching", version: update.version });
  await deps.notify(deps.t("update.installed"), title);
  await deps.relaunch();
  return { status: "updated", version: update.version };
}

function createDownloadProgressReporter(
  version: string,
  onProgress?: UpdateProgressHandler
): (event: UpdateDownloadEvent) => void {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  return (event) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = positiveNumber(event.data.contentLength);
      onProgress?.({
        stage: "downloading",
        version,
        downloadedBytes,
        totalBytes,
        percent: progressPercent(downloadedBytes, totalBytes),
      });
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += nonNegativeNumber(event.data.chunkLength);
      onProgress?.({
        stage: "downloading",
        version,
        downloadedBytes,
        totalBytes,
        percent: progressPercent(downloadedBytes, totalBytes),
      });
      return;
    }

    const finalBytes = totalBytes ?? downloadedBytes;
    onProgress?.({
      stage: "installing",
      version,
      downloadedBytes: finalBytes,
      totalBytes,
      percent: progressPercent(finalBytes, totalBytes),
    });
  };
}

function positiveNumber(value: number | undefined): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function nonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function progressPercent(
  downloadedBytes: number,
  totalBytes?: number
): number | undefined {
  if (!totalBytes) return undefined;
  const percent = Math.round((downloadedBytes / totalBytes) * 100);
  return Math.max(0, Math.min(100, percent));
}
