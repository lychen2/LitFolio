import { CONTRACT_VERSION, ContractError } from "@/core/contracts";

export type JobOwnerV1 = { kind: "core"; component: string } | { kind: "plugin"; pluginId: string; pluginVersion: string; generation: number };
export type JobStateV1 = "queued" | "running" | "cancelling" | "terminal";
export type JobTerminalV1 = "succeeded" | "failed" | "cancelled" | "interrupted";
export interface JobEventV1 { contractVersion: typeof CONTRACT_VERSION; jobId: string; seq: number; at: number; kind: string; state: JobStateV1; data: Record<string, unknown>; }
export interface JobRecordV1 { contractVersion: typeof CONTRACT_VERSION; id: string; owner: JobOwnerV1; kind: string; trigger: { kind: string; id: string }; state: JobStateV1; progress: { current: number; total: number }; executionCorrelationId: string; cancellation: { requested: boolean; requestedAt: number | null; reason: string | null }; terminal: { outcome: JobTerminalV1; resultSummary: Record<string, unknown> | null; error: Record<string, unknown> | null } | null; createdAt: number; startedAt: number | null; updatedAt: number; finishedAt: number | null; }

const recordFields = ["contractVersion", "id", "owner", "kind", "trigger", "state", "progress", "executionCorrelationId", "cancellation", "terminal", "createdAt", "startedAt", "updatedAt", "finishedAt"] as const;
const eventFields = ["contractVersion", "jobId", "seq", "at", "kind", "state", "data"] as const;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const terminalOutcomes = new Set<JobTerminalV1>(["succeeded", "failed", "cancelled", "interrupted"]);

function object(value: unknown, code: string, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractError(code, path);
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[], code: string, path: string): Record<string, unknown> {
  const result = object(value, code, path);
  for (const key of Object.keys(result)) if (!keys.includes(key)) throw new ContractError(code, `${path}.${key}`);
  for (const key of keys) if (!(key in result)) throw new ContractError(code, `${path}.${key}`);
  return result;
}
function nullableTimestamp(value: unknown): value is number | null { return value === null || integer(value); }

export function validateJobLifecycleV1(recordValue: unknown, eventValues: unknown[]): JobRecordV1 {
  const record = exact(recordValue, recordFields, "job_record_invalid", "record") as unknown as JobRecordV1;
  const owner = exact(record.owner, record.owner?.kind === "core" ? ["kind", "component"] : ["kind", "pluginId", "pluginVersion", "generation"], "job_owner_generation_required", "record.owner");
  if (!text(record.id) || !text(record.kind) || !text(record.executionCorrelationId) || !integer(record.createdAt) || !integer(record.updatedAt) || !nullableTimestamp(record.startedAt) || !nullableTimestamp(record.finishedAt) || !["queued", "running", "cancelling", "terminal"].includes(record.state)) throw new ContractError("job_record_invalid", "record");
  if (owner.kind === "core") {
    if (!text(owner.component)) throw new ContractError("job_owner_generation_required", "record.owner");
  } else if (owner.kind !== "plugin" || !text(owner.pluginId) || !text(owner.pluginVersion) || !integer(owner.generation) || owner.generation < 1) throw new ContractError("job_owner_generation_required", "record.owner");
  const trigger = exact(record.trigger, ["kind", "id"], "job_record_invalid", "record.trigger");
  const progress = exact(record.progress, ["current", "total"], "job_record_invalid", "record.progress");
  if (!text(trigger.kind) || !text(trigger.id) || !integer(progress.current) || !integer(progress.total) || progress.current > progress.total) throw new ContractError("job_record_invalid", "record");
  const cancellation = exact(record.cancellation, ["requested", "requestedAt", "reason"], "job_cancellation_invalid", "record.cancellation");
  if (typeof cancellation.requested !== "boolean" || !nullableTimestamp(cancellation.requestedAt) || (cancellation.reason !== null && !text(cancellation.reason))) throw new ContractError("job_cancellation_invalid", "record.cancellation");
  if (!Array.isArray(eventValues) || eventValues.length === 0) throw new ContractError("job_event_invalid", "events");

  let state: JobStateV1 | undefined;
  let previousAt = -1;
  let previousSeq = 0;
  let latestProgress = { current: 0, total: record.progress.total };
  let startedAt: number | null = null;
  let cancellationEvent: JobEventV1 | null = null;
  let terminalEvent: JobEventV1 | null = null;

  for (const [index, value] of eventValues.entries()) {
    const event = exact(value, eventFields, "job_event_invalid", `events[${index}]`) as unknown as JobEventV1;
    if (terminalEvent) throw new ContractError("job_event_after_terminal", `events[${index}]`);
    if (event.contractVersion !== CONTRACT_VERSION || event.jobId !== record.id || !integer(event.seq) || event.seq !== previousSeq + 1 || !integer(event.at) || event.at < previousAt) throw new ContractError("job_event_sequence_invalid", `events[${index}]`);
    const data = object(event.data, "job_event_invalid", `events[${index}].data`);
    const transition = `${state ?? "none"}:${event.kind}:${event.state}`;
    if (transition === "none:queued:queued") exact(data, [], "job_event_invalid", `events[${index}].data`);
    else if (transition === "queued:started:running") { exact(data, [], "job_event_invalid", `events[${index}].data`); startedAt = event.at; }
    else if (transition === "running:progress:running") {
      const update = exact(data, ["current", "total"], "job_event_invalid", `events[${index}].data`);
      if (!integer(update.current) || !integer(update.total) || update.current > update.total || update.current < latestProgress.current || update.total < latestProgress.total) throw new ContractError("job_event_invalid", `events[${index}].data`);
      latestProgress = { current: update.current, total: update.total };
    } else if ((state === "queued" || state === "running") && event.kind === "cancellation_requested" && event.state === "cancelling" && !cancellationEvent) {
      const request = exact(data, ["reason"], "job_event_invalid", `events[${index}].data`);
      if (!text(request.reason)) throw new ContractError("job_event_invalid", `events[${index}].data.reason`);
      cancellationEvent = event;
    } else if (event.kind === "terminal" && event.state === "terminal" && terminalOutcomes.has(data.outcome as JobTerminalV1) && ((state === "running" && (data.outcome === "succeeded" || data.outcome === "failed")) || (state === "cancelling" && (data.outcome === "cancelled" || data.outcome === "interrupted")) || ((state === "queued" || state === "running" || state === "cancelling") && data.outcome === "interrupted"))) {
      exact(data, ["outcome"], "job_event_invalid", `events[${index}].data`);
      terminalEvent = event;
    } else throw new ContractError("job_state_transition_invalid", `events[${index}]`);
    previousSeq = event.seq; previousAt = event.at; state = event.state;
  }

  if (record.state !== state || record.createdAt !== (eventValues[0] as JobEventV1).at || record.updatedAt !== previousAt || record.startedAt !== startedAt) throw new ContractError("job_record_invalid", "record");
  if (record.progress.current !== latestProgress.current || record.progress.total !== latestProgress.total) throw new ContractError("job_record_invalid", "record.progress");
  if (record.cancellation.requested !== Boolean(cancellationEvent) || (cancellationEvent && (record.cancellation.requestedAt !== cancellationEvent.at || record.cancellation.reason !== cancellationEvent.data.reason))) throw new ContractError("job_cancellation_invalid", "record.cancellation");
  if (terminalEvent) {
    const terminal = exact(record.terminal, ["outcome", "resultSummary", "error"], "job_terminal_invalid", "record.terminal");
    if (record.state !== "terminal" || !terminalOutcomes.has(terminal.outcome as JobTerminalV1) || terminal.outcome !== terminalEvent.data.outcome || record.finishedAt !== terminalEvent.at) throw new ContractError("job_terminal_invalid", "record.terminal");
  } else if (record.state === "terminal" || record.terminal !== null || record.finishedAt !== null) throw new ContractError("job_terminal_invalid", "record.terminal");
  if (record.startedAt !== null && record.createdAt > record.startedAt || record.finishedAt !== null && (record.startedAt === null || record.startedAt > record.finishedAt)) throw new ContractError("job_record_invalid", "record");
  return record;
}
