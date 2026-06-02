import { confirm, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

let started = false;

export async function startAutoUpdateCheck(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const update = await check();
    if (!update) return;

    const shouldInstall = await confirm(
      `LitFolio ${update.version} is available. Install it now?`,
      { title: "LitFolio Update", kind: "info" },
    );
    if (!shouldInstall) return;

    await update.downloadAndInstall();
    await message("LitFolio has been updated and will restart now.", {
      title: "LitFolio Update",
      kind: "info",
    });
    await relaunch();
  } catch (error) {
    console.warn("auto update check failed", error);
  }
}
