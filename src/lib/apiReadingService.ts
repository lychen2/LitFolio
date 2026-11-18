import { invoke } from "@tauri-apps/api/core";
import { invokeParsed } from "./apiInvoke";
import type { Shape } from "./apiSchemaCore";
import { object, optionalStringField, schemaError, stringArrayField, stringField } from "./apiSchemaCore";

export interface ReadingServiceSession {
  url: string;
}

/** Service-issued URLs only; every page keeps upstream's own HTTP/WS origin. */
export function parseReadingServiceSession(value: unknown, path = "ReadingServiceSession"): ReadingServiceSession {
  const obj = object(value, path);
  const url = stringField(obj, "url", path);
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/(?:read\/[A-Za-z0-9_-]{4,64})?$/.exec(url);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
    throw schemaError(`${path}.url`, "loopback library or reader URL with port 1-65535", url);
  }
  return { url };
}

/**
 * The canonical actions the hosted reader offers to the host. The upstream
 * page stays the single reading surface; each action hands paper identity, or
 * the selected passage, to the host's own tools instead of duplicating them
 * inside the iframe.
 */
export const READING_ACTIONS = [
  "details",
  "tldr",
  "quick-read",
  "translate-metadata",
  "similar",
  "review",
  "export",
  "zotero",
  "queue-add",
  "queue-open",
  "collections",
  "selection-translate",
  "terms",
  "notes",
  "highlights",
  "cached",
  "pdf",
] as const;

export type ReadingAction = (typeof READING_ACTIONS)[number];

/** One action request from the reader page, addressed by upstream paper IDs. */
export interface ReadingHostAction {
  type: "action";
  action: ReadingAction;
  paperIds: string[];
  text?: string;
}

/** Panels that show no single paper and therefore take no IDs. */
const EMPTY_ALLOWED: ReadonlySet<ReadingAction> = new Set<ReadingAction>(["queue-open", "collections"]);

const PAPER_ID = /^[A-Za-z0-9_-]{4,64}$/;

const ACTIONS: ReadonlySet<string> = new Set<string>(READING_ACTIONS);

/** Host route a reader link resolves to; the app maps each kind to its own page. */
export type ReadingHostRoute =
  | { kind: "library" }
  | { kind: "settings" }
  | { kind: "ask" }
  | { kind: "reader"; paperId: string };

export type ReadingHostMessage =
  | { type: "navigate"; route: ReadingHostRoute }
  | { type: "library-changed" }
  | { type: "imported"; paperId: string; reference: string }
  | { type: "delete"; paperId: string; requestId: string }
  | ReadingHostAction;

function parseAction(obj: Shape, path: string): ReadingHostAction {
  const action = stringField(obj, "action", path);
  if (!ACTIONS.has(action)) {
    throw schemaError(`${path}.action`, READING_ACTIONS.join(", "), action);
  }
  const typed = action as ReadingAction;
  const ids = stringArrayField(obj, "paperIds", path);
  if (typed === "selection-translate") {
    if (ids.length !== 1) throw schemaError(`${path}.paperIds`, "exactly one paper ID", ids);
  } else if (ids.length === 0 && !EMPTY_ALLOWED.has(typed)) {
    throw schemaError(`${path}.paperIds`, "at least one paper ID", ids);
  }
  for (const id of ids) {
    if (!PAPER_ID.test(id)) throw schemaError(`${path}.paperIds`, "upstream paper IDs", id);
  }
  const text = optionalStringField(obj, "text", path);
  if (typed === "selection-translate") {
    if (text === undefined || !text.trim()) {
      throw schemaError(`${path}.text`, "selected source text", text ?? null);
    }
    return { type: "action", action: typed, paperIds: ids, text };
  }
  return text === undefined
    ? { type: "action", action: typed, paperIds: ids }
    : { type: "action", action: typed, paperIds: ids, text };
}

const STATIC_ROUTES: Record<string, ReadingHostRoute | undefined> = {
  "/": { kind: "library" },
  "/settings": { kind: "settings" },
  "/ask": { kind: "ask" },
};

/** Call only after checking both the source window and service origin. */
export function parseReadingHostMessage(value: unknown, path = "ReadingHostMessage"): ReadingHostMessage {
  const obj = object(value, path);
  if (stringField(obj, "source", path) !== "litfolio-easyread") {
    throw schemaError(`${path}.source`, "litfolio-easyread", obj.source);
  }
  const type = stringField(obj, "type", path);
  if (type === "action") return parseAction(obj, path);
  if (type === "library-changed") return { type };
  if (type === "delete") {
    const paperId = stringField(obj, "paperId", path);
    const requestId = stringField(obj, "requestId", path);
    if (!PAPER_ID.test(paperId)) throw schemaError(`${path}.paperId`, "upstream paper ID", paperId);
    if (!/^\d{1,12}$/.test(requestId)) throw schemaError(`${path}.requestId`, "delete request ID", requestId);
    return { type, paperId, requestId };
  }
  if (type === "imported") {
    const paperId = stringField(obj, "paperId", path);
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(paperId)) {
      throw schemaError(`${path}.paperId`, "upstream paper ID", paperId);
    }
    return { type, paperId, reference: stringField(obj, "reference", path) };
  }
  if (type !== "navigate") {
    throw schemaError(`${path}.type`, "navigate, imported, library-changed, delete or action", type);
  }
  const target = stringField(obj, "path", path);
  const readerMatch = /^\/read\/([A-Za-z0-9_-]{4,64})$/.exec(target);
  if (readerMatch) return { type, route: { kind: "reader", paperId: readerMatch[1] } };
  const route = Object.hasOwn(STATIC_ROUTES, target) ? STATIC_ROUTES[target] : undefined;
  if (route) return { type, route };
  throw schemaError(`${path}.path`, "/read/<id>, /, /settings or /ask", target);
}

export const readingServiceApi = {
  open: (id?: string): Promise<ReadingServiceSession> =>
    invokeParsed("reading_service_open", { id: id ?? null }, parseReadingServiceSession),
  sync: () => invoke<void>("reading_service_sync"),
};
