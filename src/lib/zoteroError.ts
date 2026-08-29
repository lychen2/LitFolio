import type { TKey } from "@/i18n/dict";

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

/** Map a Zotero push failure to a localized, actionable message. */
export function zoteroErrorMessage(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not configured")) {
    return t("library.zoteroError.notConfigured");
  }
  if (message.includes("connector request failed") || message.includes("ECONNREFUSED") || message.includes("timed out")) {
    return t("library.zoteroError.unreachable");
  }
  return t("library.zoteroError.generic", { message });
}
