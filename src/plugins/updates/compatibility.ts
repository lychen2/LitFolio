import { isTauri } from "@tauri-apps/api/core";
import type { TKey } from "@/i18n/dict";
import type { I18nVars } from "@/i18n/format";
import { errorMessage } from "@/lib/error";
import {
  runUpdateCheck,
  type UpdateDeps,
  type UpdateOutcome,
  type UpdateProgress,
} from "@/lib/autoUpdate";

/**
 * Temporary Settings adapter. The later updates extraction owns its removal;
 * core boot must not import this module or schedule update checks.
 */
export async function checkForUpdatesFromSettings(
  t: (key: TKey, vars?: I18nVars) => string,
  onProgress?: (progress: UpdateProgress) => void
): Promise<UpdateOutcome> {
  if (!isTauri()) return { status: "unsupported" };
  try {
    return await runUpdateCheck(await buildTauriDeps(t), {
      prompt: true,
      onProgress,
    });
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

async function buildTauriDeps(
  t: (key: TKey, vars?: I18nVars) => string
): Promise<UpdateDeps> {
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
    confirm: (messageText, title) => confirm(messageText, { title, kind: "info" }),
    notify: async (messageText, title) => {
      await message(messageText, { title, kind: "info" });
    },
    relaunch,
    t,
    log: (messageText) => console.warn(messageText),
  };
}
