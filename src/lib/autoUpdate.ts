import { isTauri } from "@tauri-apps/api/core";
import { dict, type Lang, type TKey } from "@/i18n/dict";
import { formatMessage, type I18nVars } from "@/i18n/format";
import { errorMessage } from "./error";

/// Translator scoped to update copy. The core only needs `(key, vars) => string`;
/// React callers pass `useT()` (keyed on `TKey`) through `checkForUpdatesManually`.
type Translator = (key: string, vars?: I18nVars) => string;

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

// ---- Real-environment wiring (not unit-tested: needs the Tauri runtime) ----

const PERIODIC_MS = 6 * 60 * 60 * 1000; // re-check every 6h for long-lived sessions
let startupDone = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function storedLang(): Lang {
  try {
    const stored = localStorage.getItem("litfolio.lang");
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return "zh";
}

// Startup/periodic run outside React, so they cannot use the `useT()` hook —
// resolve the persisted locale and translate straight from the dictionary.
const standaloneT: Translator = (key, vars) =>
  formatMessage(
    dict[storedLang()][key as TKey] ?? dict.zh[key as TKey] ?? key,
    vars
  );

async function buildTauriDeps(t: Translator): Promise<UpdateDeps> {
  const [{ check }, { confirm, message }, { relaunch }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-process"),
  ]);
  return {
    isTauri,
    check: async () => {
      const update = await check();
      if (!update) return null;
      return {
        version: update.version,
        downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
      };
    },
    confirm: (msg, title) => confirm(msg, { title, kind: "info" }),
    notify: async (msg, title) => {
      await message(msg, { title, kind: "info" });
    },
    relaunch,
    t,
    log: (msg) => console.warn(msg),
  };
}

function schedulePeriodic(t: Translator): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void buildTauriDeps(t)
      .then((deps) => runUpdateCheck(deps, { prompt: true }))
      .catch((error) => console.warn("periodic update check failed", error));
  }, PERIODIC_MS);
}

export async function startAutoUpdateCheck(): Promise<void> {
  if (startupDone) return;
  startupDone = true;
  if (!isTauri()) return;
  try {
    const deps = await buildTauriDeps(standaloneT);
    await runUpdateCheck(deps, { prompt: true });
  } catch (error) {
    console.warn("auto update bootstrap failed", error);
  }
  schedulePeriodic(standaloneT);
}

/// Manual check entry point for the Settings page. Returns the outcome (including
/// the failure reason) so the UI can show the user exactly what happened.
export async function checkForUpdatesManually(
  t: (key: TKey, vars?: I18nVars) => string,
  onProgress?: UpdateProgressHandler
): Promise<UpdateOutcome> {
  if (!isTauri()) return { status: "unsupported" };
  try {
    const deps = await buildTauriDeps((key, vars) => t(key as TKey, vars));
    return await runUpdateCheck(deps, { prompt: true, onProgress });
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
