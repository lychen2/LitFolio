import { invoke } from "@tauri-apps/api/core";

import { parseSyncPreviewReport, parseSyncReport } from "./apiSchema";
import { invokeParsed } from "./apiInvoke";

export interface WebDavConfig {
  base_url: string;
  remote_path: string;
  username: string;
  password: string;
}

export interface SyncConfig {
  webdav: WebDavConfig;
}

export interface SyncConnectionResult {
  remote_root: string;
}

export interface SyncReport {
  remote_root: string;
  file_count: number;
  total_bytes: number;
  skipped_count: number;
  skipped_bytes: number;
  restart_required: boolean;
  backup_path?: string | null;
}

export type SyncPreviewDirection = "push" | "pull";
export type SyncPreviewAction =
  | "upload_new"
  | "upload_replace"
  | "delete_remote"
  | "download_new"
  | "download_replace"
  | "delete_local";

export interface SyncPreviewChange {
  path: string;
  action: SyncPreviewAction;
  size: number;
}

export interface SyncPreviewReport {
  direction: SyncPreviewDirection;
  remote_root: string;
  add_count: number;
  update_count: number;
  delete_count: number;
  unchanged_count: number;
  transfer_bytes: number;
  restart_required: boolean;
  backup_path?: string | null;
  changes: SyncPreviewChange[];
}

export const EMPTY_SYNC_CONFIG: SyncConfig = {
  webdav: {
    base_url: "",
    remote_path: "",
    username: "",
    password: "",
  },
};

export const syncApi = {
  getConfig: () => invoke<SyncConfig>("sync_get_config"),
  saveConfig: (config: SyncConfig) =>
    invoke<void>("sync_save_config", { config }),
  test: () => invoke<SyncConnectionResult>("sync_test"),
  previewPushLibrary: () =>
    invokeParsed(
      "sync_preview_push_library",
      undefined,
      parseSyncPreviewReport
    ),
  previewPullLibrary: () =>
    invokeParsed(
      "sync_preview_pull_library",
      undefined,
      parseSyncPreviewReport
    ),
  pushLibrary: () =>
    invokeParsed("sync_push_library", undefined, parseSyncReport),
  pullLibrary: () =>
    invokeParsed("sync_pull_library", undefined, parseSyncReport),
};
