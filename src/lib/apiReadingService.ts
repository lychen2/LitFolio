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

export const READER_SHORTCUTS = ["1", "2", "3", "j", "k", "]", "[", "?"] as const;
export type ReaderShortcut = (typeof READER_SHORTCUTS)[number];
const SHORTCUTS: ReadonlySet<string> = new Set<string>(READER_SHORTCUTS);
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
  | { kind: "import"; tab?: "pdf" | "arxiv_doi"; link?: string }
  | { kind: "reader"; paperId: string };

export type ReadingHostMessage =
  | { type: "navigate"; route: ReadingHostRoute }
  | { type: "ready" }
  | { type: "library-changed" }
  | { type: "delete"; paperId: string; requestId: string }
  | { type: "library-collection"; key: string | null }
  | { type: "library-collection-retry" }
  | { type: "reader-shortcut"; key: ReaderShortcut }
  | { type: "reader-control"; control: "extras" | "split" }
  | { type: "note-ime-anchor"; x: number; y: number; height: number }
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
  "/import": { kind: "import" },
  "/import?tab=pdf": { kind: "import", tab: "pdf" },
  "/import?tab=arxiv_doi": { kind: "import", tab: "arxiv_doi" },
};

/** Call only after checking both the source window and service origin. */
export function parseReadingHostMessage(value: unknown, path = "ReadingHostMessage"): ReadingHostMessage {
  const obj = object(value, path);
  if (stringField(obj, "source", path) !== "litfolio-core") {
    throw schemaError(`${path}.source`, "litfolio-core", obj.source);
  }
  const type = stringField(obj, "type", path);
  if (type === "action") return parseAction(obj, path);
  if (type === "ready") return { type };
  if (type === "library-changed") return { type };
  if (type === "library-collection-retry") return { type };
  if (type === "library-collection") {
    if (obj.key === null) return { type, key: null };
    const key = stringField(obj, "key", path);
    if (!/^(folder|smart):\d+$/.test(key)) throw schemaError(`${path}.key`, "folder or smart collection key", key);
    return { type, key };
  }
  if (type === "reader-shortcut") {
    const key = stringField(obj, "key", path);
    if (!SHORTCUTS.has(key)) throw schemaError(`${path}.key`, "reader shortcut", key);
    return { type, key: key as ReaderShortcut };
  }
  if (type === "reader-control") {
    const control = stringField(obj, "control", path);
    if (control !== "extras" && control !== "split") throw schemaError(`${path}.control`, "extras or split", control);
    return { type, control };
  }
  if (type === "note-ime-anchor") {
    const { x, y, height } = obj;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 ||
        typeof y !== "number" || !Number.isFinite(y) || y < 0 ||
        typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
      throw schemaError(path, "visible note editor coordinates", obj);
    }
    return { type, x, y, height };
  }
  if (type === "delete") {
    const paperId = stringField(obj, "paperId", path);
    const requestId = stringField(obj, "requestId", path);
    if (!PAPER_ID.test(paperId)) throw schemaError(`${path}.paperId`, "upstream paper ID", paperId);
    if (!/^\d{1,12}$/.test(requestId)) throw schemaError(`${path}.requestId`, "delete request ID", requestId);
    return { type, paperId, requestId };
  }
  if (type !== "navigate") {
    throw schemaError(`${path}.type`, "reading host message type", type);
  }
  const target = stringField(obj, "path", path);
  const readerMatch = /^\/read\/([A-Za-z0-9_-]{4,64})$/.exec(target);
  if (readerMatch) return { type, route: { kind: "reader", paperId: readerMatch[1] } };
  const route = Object.hasOwn(STATIC_ROUTES, target) ? STATIC_ROUTES[target] : undefined;
  if (target === "/import?tab=arxiv_doi") {
    const link = optionalStringField(obj, "link", path);
    if (link?.trim()) return { type, route: { kind: "import", tab: "arxiv_doi", link } };
  }
  if (route) return { type, route };
  throw schemaError(`${path}.path`, "reading host navigation target", target);
}

export const readingServiceApi = {
  open: (id?: string): Promise<ReadingServiceSession> =>
    invokeParsed("reading_service_open", { id: id ?? null }, parseReadingServiceSession),
  sync: () => invoke<void>("reading_service_sync"),
  positionNoteIme: (x: number, y: number, height: number) =>
    invoke<void>("reading_service_position_note_ime", { x, y, height }),
};
