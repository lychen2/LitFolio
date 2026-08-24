import {
  enumStringField,
  nullableNumberField,
  nullableStringField,
  numberField,
  object,
  stringField,
  type Shape,
} from "./apiSchemaCore";

const executionStates = new Set(["running", "succeeded", "failed", "cancelled"]);

export type AiExecutionState = "running" | "succeeded" | "failed" | "cancelled";

/** Redacted, core-owned record of one AI dispatch. */
export interface AiExecutionRecord {
  id: string;
  operation: string;
  trigger: string;
  envelopeId: string;
  paperId: string | null;
  profileName: string;
  model: string;
  state: AiExecutionState;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  errorSummary: string | null;
}

function executionState(obj: Shape, path: string): AiExecutionState {
  return enumStringField(obj, "state", path, executionStates) as AiExecutionState;
}

export function parseAiExecutionRecord(value: unknown, path = "AiExecutionRecord"): AiExecutionRecord {
  const obj: Shape = object(value, path);
  return {
    id: stringField(obj, "id", path),
    operation: stringField(obj, "operation", path),
    trigger: stringField(obj, "trigger", path),
    envelopeId: stringField(obj, "envelopeId", path),
    paperId: nullableStringField(obj, "paperId", path),
    profileName: stringField(obj, "profileName", path),
    model: stringField(obj, "model", path),
    state: executionState(obj, path),
    startedAt: numberField(obj, "startedAt", path),
    finishedAt: nullableNumberField(obj, "finishedAt", path),
    durationMs: nullableNumberField(obj, "durationMs", path),
    errorSummary: nullableStringField(obj, "errorSummary", path),
  };
}
