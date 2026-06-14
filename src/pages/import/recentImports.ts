export const RECENT_IMPORTS_CHANGED_EVENT = "litera:recent-imports-changed";

export function notifyRecentImportsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_IMPORTS_CHANGED_EVENT));
}
