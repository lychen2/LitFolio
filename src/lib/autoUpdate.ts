import { isTauri } from "@tauri-apps/api/core";
import { dict, type Lang, type TKey } from "@/i18n/dict";
import { formatMessage, type I18nVars } from "@/i18n/format";
import { errorMessage } from "./error";

/// Translator scoped to update copy. The core only needs `(key, vars) => string`;
/// React callers pass `useT()` (keyed on `TKey`) through `checkForUpdatesManually`.
type Translator = (key: string, vars?: I18nVars) => string;

export interface UpdateHandle {
  version: string;
  downloadAndInstall: () => Promise<void>;
}

export type UpdateOutcome =
  | { status: "updated"; version: string }
  | { status: "declined"; version: string }
  | { status: "up-to-date" }
  | { status: "unsupported" }
  | { status: "busy" }
  | { status: "error"; message: string };

export interface UpdateDeps {
  isTauri: () => boolean;
  check: () => Promise<UpdateHandle | null>;
  confirm: (message: string, title: string) => Promise<boolean>;
  notify: (message: string, title: string) => Promise<void>;
  relaunch: () => Promise<void>;
  t: Translator;
  log: (message: string) => void;
}

// Single-flight guard: the updater plugin is process-global, so overlapping
// checks (startup vs. periodic vs. a manual click) would race the download.
let inFlight = false;

export async function runUpdateCheck(
  deps: UpdateDeps,
  options: { prompt: boolean },
): Promise<UpdateOutcome> {
  if (!deps.isTauri()) return { status: "unsupported" };
  if (inFlight) return { status: "busy" };
  inFlight = true;
  try {
    return await drive(deps, options.prompt);
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

async function drive(deps: UpdateDeps, prompt: boolean): Promise<UpdateOutcome> {
  const update = await deps.check();
  if (!update) return { status: "up-to-date" };

  const title = deps.t("update.title");
  if (prompt) {
    const accepted = await deps.confirm(deps.t("update.available", { version: update.version }), title);
    if (!accepted) return { status: "declined", version: update.version };
  }

  await update.downloadAndInstall();
  await deps.notify(deps.t("update.installed"), title);
  await deps.relaunch();
  return { status: "updated", version: update.version };
}

// ---- Real-environment wiring (not unit-tested: needs the Tauri runtime) ----

const PERIODIC_MS = 6 * 60 * 60 * 1000; // re-check every 6h for long-lived sessions
let startupDone = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function storedLang(): Lang {
  try {
    const stored = localStorage.getItem("litfolio.lang");
    if (stored === "en" || stored === "zh") return stored;
  } catch { /* localStorage unavailable */ }
  return "zh";
}

// Startup/periodic run outside React, so they cannot use the `useT()` hook —
// resolve the persisted locale and translate straight from the dictionary.
const standaloneT: Translator = (key, vars) =>
  formatMessage(dict[storedLang()][key as TKey] ?? dict.zh[key as TKey] ?? key, vars);

async function buildTauriDeps(t: Translator): Promise<UpdateDeps> {
  const [{ check }, { confirm, message }, { relaunch }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-process"),
  ]);
  return {
    isTauri,
    check: () => check(),
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
): Promise<UpdateOutcome> {
  if (!isTauri()) return { status: "unsupported" };
  try {
    const deps = await buildTauriDeps((key, vars) => t(key as TKey, vars));
    return await runUpdateCheck(deps, { prompt: true });
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
