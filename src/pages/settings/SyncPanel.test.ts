import { describe, expect, it } from "vitest";
import { createSyncLastResult, summarizeSyncConfig } from "./syncPanelState";

describe("summarizeSyncConfig", () => {
  it("shows the effective WebDAV remote and authenticated user", () => {
    const summary = summarizeSyncConfig({
      webdav: {
        base_url: "https://dav.test/root/",
        remote_path: "/litera/main",
        username: "alice",
        password: "secret",
      },
    });

    expect(summary).toEqual({
      configured: true,
      remote: "https://dav.test/root/litera/main",
      username: "alice",
      authMode: "authenticated",
    });
  });

  it("marks incomplete config as not configured", () => {
    expect(summarizeSyncConfig({
      webdav: { base_url: "", remote_path: "litera/main", username: "", password: "" },
    }).configured).toBe(false);
  });
});

describe("createSyncLastResult", () => {
  it("records the action, status, message, and timestamp", () => {
    expect(createSyncLastResult(
      "push",
      "success",
      "Uploaded 3 files",
      new Date("2026-06-19T12:00:00.000Z"),
    )).toEqual({
      kind: "push",
      status: "success",
      message: "Uploaded 3 files",
      at: "2026-06-19T12:00:00.000Z",
    });
  });
});
