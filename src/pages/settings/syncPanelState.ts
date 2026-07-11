import type { SyncConfig } from "@/lib/syncApi";

export type SyncLastResultKind =
  | "save"
  | "test"
  | "preview_push"
  | "preview_pull"
  | "push"
  | "pull";

export interface SyncLastResult {
  kind: SyncLastResultKind;
  status: "success" | "error";
  message: string;
  at: string;
}

export function summarizeSyncConfig(config: SyncConfig) {
  const baseUrl = config.webdav.base_url.trim().replace(/\/+$/, "");
  const remotePath = config.webdav.remote_path.trim().replace(/^\/+/, "");
  const username = config.webdav.username.trim();
  return {
    configured: baseUrl !== "" && remotePath !== "",
    remote: baseUrl && remotePath ? `${baseUrl}/${remotePath}` : baseUrl || remotePath,
    username,
    authMode: username ? "authenticated" : "anonymous",
  };
}

export function createSyncLastResult(
  kind: SyncLastResultKind,
  status: SyncLastResult["status"],
  message: string,
  now: Date,
): SyncLastResult {
  return {
    kind,
    status,
    message,
    at: now.toISOString(),
  };
}
