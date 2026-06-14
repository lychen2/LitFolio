import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runUpdateCheck,
  type UpdateDeps,
  type UpdateDownloadEvent,
  type UpdateProgress,
} from "./autoUpdate";

function makeDeps(over: Partial<UpdateDeps> = {}): UpdateDeps {
  return {
    isTauri: () => true,
    check: async () => null,
    confirm: async () => true,
    notify: async () => {},
    relaunch: async () => {},
    t: (key) => key,
    log: () => {},
    ...over,
  };
}

describe("runUpdateCheck", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports unsupported outside Tauri without touching the updater", async () => {
    const check = vi.fn();
    const outcome = await runUpdateCheck(
      makeDeps({ isTauri: () => false, check }),
      { prompt: true }
    );
    expect(outcome).toEqual({ status: "unsupported" });
    expect(check).not.toHaveBeenCalled();
  });

  it("reports up-to-date when the backend offers no update", async () => {
    const outcome = await runUpdateCheck(
      makeDeps({ check: async () => null }),
      { prompt: true }
    );
    expect(outcome).toEqual({ status: "up-to-date" });
  });

  it("installs and relaunches when an update is accepted", async () => {
    const downloadAndInstall = vi.fn(async () => {});
    const relaunch = vi.fn(async () => {});
    const outcome = await runUpdateCheck(
      makeDeps({
        check: async () => ({ version: "0.3.10", downloadAndInstall }),
        confirm: async () => true,
        relaunch,
      }),
      { prompt: true }
    );
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ status: "updated", version: "0.3.10" });
  });

  it("does not install when the user declines", async () => {
    const downloadAndInstall = vi.fn(async () => {});
    const outcome = await runUpdateCheck(
      makeDeps({
        check: async () => ({ version: "0.3.10", downloadAndInstall }),
        confirm: async () => false,
      }),
      { prompt: true }
    );
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "declined", version: "0.3.10" });
  });

  it("surfaces the failure reason instead of swallowing it", async () => {
    const log = vi.fn();
    const outcome = await runUpdateCheck(
      makeDeps({
        check: async () => {
          throw new Error("signature verification failed");
        },
        log,
      }),
      { prompt: true }
    );
    expect(outcome).toEqual({
      status: "error",
      message: "signature verification failed",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("signature verification failed")
    );
  });

  it("skips the confirm dialog when prompt is disabled", async () => {
    const confirm = vi.fn(async () => true);
    const downloadAndInstall = vi.fn(async () => {});
    const outcome = await runUpdateCheck(
      makeDeps({
        check: async () => ({ version: "0.3.10", downloadAndInstall }),
        confirm,
      }),
      { prompt: false }
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ status: "updated", version: "0.3.10" });
  });

  it("reports download progress before install and relaunch", async () => {
    const progress: UpdateProgress[] = [];
    const downloadAndInstall = vi.fn(
      async (onEvent?: (event: UpdateDownloadEvent) => void) => {
        onEvent?.({ event: "Started", data: { contentLength: 100 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 25 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 50 } });
        onEvent?.({ event: "Finished" });
      }
    );

    const outcome = await runUpdateCheck(
      makeDeps({
        check: async () => ({ version: "0.3.10", downloadAndInstall }),
        confirm: async () => true,
      }),
      { prompt: true, onProgress: (next) => progress.push(next) }
    );

    expect(outcome).toEqual({ status: "updated", version: "0.3.10" });
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function));
    expect(progress.map((item) => item.stage)).toEqual([
      "checking",
      "available",
      "downloading",
      "downloading",
      "downloading",
      "downloading",
      "installing",
      "relaunching",
    ]);
    expect(progress[4]).toMatchObject({
      stage: "downloading",
      version: "0.3.10",
      downloadedBytes: 25,
      totalBytes: 100,
      percent: 25,
    });
    expect(progress[5]).toMatchObject({ downloadedBytes: 75, percent: 75 });
    expect(progress[6]).toMatchObject({
      stage: "installing",
      downloadedBytes: 100,
      totalBytes: 100,
      percent: 100,
    });
  });

  it("refuses to run a second check while one is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      check: async () => {
        await gate;
        return null;
      },
    });
    const first = runUpdateCheck(deps, { prompt: true });
    const second = await runUpdateCheck(deps, { prompt: true });
    expect(second).toEqual({ status: "busy" });
    release();
    expect(await first).toEqual({ status: "up-to-date" });
  });
});
