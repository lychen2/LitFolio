export const CONTRACT_VERSION = "target-mono-v1" as const;

export type {
  PdfAnnotationRect,
  PdfHighlight,
  PdfTextNote,
  PdfTextNoteCreateInput,
  PdfTextNotePatch,
  PdfTextNoteSearchResult,
  ReaderAnnotation,
} from "./readerAnnotations";
export {
  isPdfTextNote,
  isValidPdfAnnotationRect,
  isValidPdfTextNoteStyle,
  PDF_TEXT_NOTE_MAX_COORDINATE,
  PDF_TEXT_NOTE_STYLE,
} from "./readerAnnotations";

export type DomainNameV1 = "paper" | "annotation" | "document-revision" | "source-segment" | "note" | "job";
export interface DomainRefV1 { contractVersion: typeof CONTRACT_VERSION; domain: DomainNameV1; id: string; }
export interface ResourceRefV1 { contractVersion: typeof CONTRACT_VERSION; resource: DomainRefV1; revision: null | { kind: "number" | "sha256"; value: string }; }

export class ContractError extends Error {
  constructor(public readonly code: string, public readonly path: string) {
    super(`${code} at ${path}`);
    this.name = "ContractError";
  }
}

const domains = new Set<DomainNameV1>(["paper", "annotation", "document-revision", "source-segment", "note", "job"]);
const asciiIdentifier = /^[\x21-\x7e]+$/;
const sha256 = /^[0-9a-f]{64}$/;
const numberRevision = /^(0|[1-9][0-9]*)$/;

function record(value: unknown, code: string, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ContractError(code, path);
  return value as Record<string, unknown>;
}
function exact(obj: Record<string, unknown>, keys: readonly string[], code: string, path: string): void {
  for (const key of Object.keys(obj)) if (!keys.includes(key)) throw new ContractError(code, `${path}.${key}`);
  for (const key of keys) if (!(key in obj)) throw new ContractError(code, `${path}.${key}`);
}

export function parseDomainRefV1(value: unknown, path = ""): DomainRefV1 {
  const obj = record(value, "domain_ref_invalid", path);
  exact(obj, ["contractVersion", "domain", "id"], "domain_ref_invalid", path);
  if (obj.contractVersion !== CONTRACT_VERSION) throw new ContractError("domain_ref_invalid", `${path}contractVersion`);
  if (typeof obj.domain !== "string" || !domains.has(obj.domain as DomainNameV1)) throw new ContractError("domain_ref_invalid", `${path}domain`);
  if (typeof obj.id !== "string" || !asciiIdentifier.test(obj.id)) throw new ContractError("domain_ref_invalid", `${path}id`);
  return obj as unknown as DomainRefV1;
}

export function parseResourceRefV1(value: unknown, path = ""): ResourceRefV1 {
  const obj = record(value, "resource_ref_invalid", path);
  exact(obj, ["contractVersion", "resource", "revision"], "resource_ref_invalid", path);
  if (obj.contractVersion !== CONTRACT_VERSION) throw new ContractError("resource_ref_invalid", `${path}contractVersion`);
  try { parseDomainRefV1(obj.resource, `${path}resource.`); } catch { throw new ContractError("resource_ref_invalid", `${path}resource`); }
  if (obj.revision !== null) {
    const revision = record(obj.revision, "resource_ref_invalid", `${path}revision`);
    exact(revision, ["kind", "value"], "resource_ref_invalid", `${path}revision`);
    if (typeof revision.value !== "string" || (revision.kind === "number" ? !numberRevision.test(revision.value) : revision.kind !== "sha256" || !sha256.test(revision.value))) throw new ContractError("resource_ref_invalid", `${path}revision.value`);
  }
  return obj as unknown as ResourceRefV1;
}
