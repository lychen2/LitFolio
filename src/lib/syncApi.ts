import { invoke } from "@tauri-apps/api/core";

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
  saveConfig: (config: SyncConfig) => invoke<void>("sync_save_config", { config }),
  test: () => invoke<SyncConnectionResult>("sync_test"),
  pushLibrary: () => invoke<SyncReport>("sync_push_library"),
  pullLibrary: () => invoke<SyncReport>("sync_pull_library"),
};
