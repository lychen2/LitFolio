//! Canonical `target-mono-v1` persisted job value and event-stream consumer.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{ContractError, JobOwnerV1, JobStateV1, JobTerminalV1, CONTRACT_VERSION};

const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobTriggerV1 {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobProgressV1 {
    pub current: u64,
    pub total: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobCancellationV1 {
    pub requested: bool,
    pub requested_at: Option<u64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobTerminalErrorV1 {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobTerminalResultV1 {
    pub outcome: JobTerminalV1,
    pub result_summary: Option<Value>,
    pub error: Option<JobTerminalErrorV1>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRecordV1 {
    pub contract_version: String,
    pub id: String,
    pub owner: JobOwnerV1,
    pub kind: String,
    pub trigger: JobTriggerV1,
    pub state: JobStateV1,
    pub progress: JobProgressV1,
    pub execution_correlation_id: String,
    pub cancellation: JobCancellationV1,
    pub terminal: Option<JobTerminalResultV1>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub updated_at: u64,
    pub finished_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobEventV1 {
    pub contract_version: String,
    pub job_id: String,
    pub seq: u64,
    pub at: u64,
    pub kind: String,
    pub state: JobStateV1,
    pub data: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedJobStreamV1 {
    pub record: JobRecordV1,
    pub events: Vec<JobEventV1>,
}

fn err(code: &'static str, path: impl Into<String>) -> ContractError {
    ContractError {
        code,
        path: path.into(),
    }
}

fn object<'a>(
    value: &'a Value,
    path: &str,
    code: &'static str,
) -> Result<&'a Map<String, Value>, ContractError> {
    value.as_object().ok_or_else(|| err(code, path))
}

fn exact_fields(
    object: &Map<String, Value>,
    fields: &[&str],
    path: &str,
    code: &'static str,
) -> Result<(), ContractError> {
    for key in object.keys() {
        if !fields.contains(&key.as_str()) {
            return Err(err(code, join(path, key)));
        }
    }
    for field in fields {
        if !object.contains_key(*field) {
            return Err(err(code, join(path, field)));
        }
    }
    Ok(())
}

fn join(path: &str, field: &str) -> String {
    if path.is_empty() {
        field.to_owned()
    } else {
        format!("{path}.{field}")
    }
}

fn string<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    path: &str,
    code: &'static str,
) -> Result<&'a str, ContractError> {
    object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| err(code, join(path, field)))
}

fn integer(
    object: &Map<String, Value>,
    field: &str,
    path: &str,
    code: &'static str,
) -> Result<u64, ContractError> {
    object
        .get(field)
        .and_then(Value::as_u64)
        .filter(|value| *value <= MAX_SAFE_INTEGER)
        .ok_or_else(|| err(code, join(path, field)))
}

fn nullable_integer(
    object: &Map<String, Value>,
    field: &str,
    path: &str,
    code: &'static str,
) -> Result<Option<u64>, ContractError> {
    match object.get(field) {
        Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_u64()
            .filter(|number| *number <= MAX_SAFE_INTEGER)
            .map(Some)
            .ok_or_else(|| err(code, join(path, field))),
        None => Err(err(code, join(path, field))),
    }
}

fn state(value: &Value, path: &str) -> Result<JobStateV1, ContractError> {
    match value.as_str() {
        Some("queued") => Ok(JobStateV1::Queued),
        Some("running") => Ok(JobStateV1::Running),
        Some("cancelling") => Ok(JobStateV1::Cancelling),
        Some("terminal") => Ok(JobStateV1::Terminal),
        _ => Err(err("job_state_invalid", path)),
    }
}

fn terminal(value: &Value, path: &str) -> Result<JobTerminalV1, ContractError> {
    match value.as_str() {
        Some("succeeded") => Ok(JobTerminalV1::Succeeded),
        Some("failed") => Ok(JobTerminalV1::Failed),
        Some("cancelled") => Ok(JobTerminalV1::Cancelled),
        Some("interrupted") => Ok(JobTerminalV1::Interrupted),
        _ => Err(err("job_terminal_invalid", path)),
    }
}

fn parse_owner(value: &Value) -> Result<JobOwnerV1, ContractError> {
    let path = "record.owner";
    let owner = object(value, path, "job_record_invalid")?;
    match owner.get("kind").and_then(Value::as_str) {
        Some("core") => {
            exact_fields(owner, &["kind", "component"], path, "job_record_invalid")?;
            Ok(JobOwnerV1::Core {
                component: string(owner, "component", path, "job_record_invalid")?.to_owned(),
            })
        }
        Some("plugin") => {
            if !owner.contains_key("generation") {
                return Err(err(
                    "job_owner_generation_required",
                    "record.owner.generation",
                ));
            }
            exact_fields(
                owner,
                &["kind", "pluginId", "pluginVersion", "generation"],
                path,
                "job_record_invalid",
            )?;
            let plugin_id = string(owner, "pluginId", path, "job_record_invalid")?.to_owned();
            let plugin_version =
                string(owner, "pluginVersion", path, "job_record_invalid")?.to_owned();
            let generation = integer(owner, "generation", path, "job_owner_generation_required")?;
            if generation == 0 {
                return Err(err(
                    "job_owner_generation_required",
                    "record.owner.generation",
                ));
            }
            Ok(JobOwnerV1::Plugin {
                plugin_id,
                plugin_version,
                generation,
            })
        }
        _ => Err(err("job_record_invalid", "record.owner.kind")),
    }
}

fn parse_progress(
    value: &Value,
    path: &str,
    code: &'static str,
) -> Result<JobProgressV1, ContractError> {
    let progress = object(value, path, code)?;
    exact_fields(progress, &["current", "total"], path, code)?;
    let current = integer(progress, "current", path, code).map_err(|error| {
        if code == "job_record_invalid" {
            err(code, path)
        } else {
            error
        }
    })?;
    let total = integer(progress, "total", path, code).map_err(|error| {
        if code == "job_record_invalid" {
            err(code, path)
        } else {
            error
        }
    })?;
    if current > total {
        return Err(err(code, path));
    }
    Ok(JobProgressV1 { current, total })
}

fn parse_cancellation(value: &Value) -> Result<JobCancellationV1, ContractError> {
    let path = "record.cancellation";
    let cancellation = object(value, path, "job_record_invalid")?;
    exact_fields(
        cancellation,
        &["requested", "requestedAt", "reason"],
        path,
        "job_record_invalid",
    )?;
    let requested = cancellation
        .get("requested")
        .and_then(Value::as_bool)
        .ok_or_else(|| err("job_record_invalid", join(path, "requested")))?;
    let requested_at = nullable_integer(cancellation, "requestedAt", path, "job_record_invalid")?;
    let reason = match cancellation.get("reason") {
        Some(Value::Null) => None,
        Some(Value::String(value)) if !value.is_empty() => Some(value.clone()),
        _ => return Err(err("job_record_invalid", join(path, "reason"))),
    };
    if requested != (requested_at.is_some() && reason.is_some()) {
        return Err(err("job_cancellation_invalid", path));
    }
    Ok(JobCancellationV1 {
        requested,
        requested_at,
        reason,
    })
}

fn parse_terminal_result(value: &Value) -> Result<Option<JobTerminalResultV1>, ContractError> {
    if value.is_null() {
        return Ok(None);
    }
    let path = "record.terminal";
    let result = object(value, path, "job_terminal_invalid")?;
    exact_fields(
        result,
        &["outcome", "resultSummary", "error"],
        path,
        "job_terminal_invalid",
    )?;
    terminal(&result["outcome"], "record.terminal.outcome")?;
    if let Some(error_value) = result.get("error").filter(|value| !value.is_null()) {
        let error_object = object(error_value, "record.terminal.error", "job_terminal_invalid")?;
        exact_fields(
            error_object,
            &["code", "message"],
            "record.terminal.error",
            "job_terminal_invalid",
        )?;
        string(
            error_object,
            "code",
            "record.terminal.error",
            "job_terminal_invalid",
        )?;
        string(
            error_object,
            "message",
            "record.terminal.error",
            "job_terminal_invalid",
        )?;
    }
    serde_json::from_value(value.clone())
        .map(Some)
        .map_err(|_| err("job_terminal_invalid", path))
}

fn parse_record(value: &Value) -> Result<JobRecordV1, ContractError> {
    let path = "record";
    let record = object(value, path, "job_record_invalid")?;
    exact_fields(
        record,
        &[
            "contractVersion",
            "id",
            "owner",
            "kind",
            "trigger",
            "state",
            "progress",
            "executionCorrelationId",
            "cancellation",
            "terminal",
            "createdAt",
            "startedAt",
            "updatedAt",
            "finishedAt",
        ],
        path,
        "job_record_invalid",
    )?;
    if string(record, "contractVersion", path, "job_record_invalid")? != CONTRACT_VERSION {
        return Err(err("job_record_invalid", "record.contractVersion"));
    }
    string(record, "id", path, "job_record_invalid")?;
    string(record, "kind", path, "job_record_invalid")?;
    string(record, "executionCorrelationId", path, "job_record_invalid")?;
    let owner = parse_owner(&record["owner"])?;
    let trigger_object = object(&record["trigger"], "record.trigger", "job_record_invalid")?;
    exact_fields(
        trigger_object,
        &["kind", "id"],
        "record.trigger",
        "job_record_invalid",
    )?;
    string(
        trigger_object,
        "kind",
        "record.trigger",
        "job_record_invalid",
    )?;
    string(trigger_object, "id", "record.trigger", "job_record_invalid")?;
    let trigger: JobTriggerV1 = serde_json::from_value(record["trigger"].clone())
        .map_err(|_| err("job_record_invalid", "record.trigger"))?;
    let record_state = state(&record["state"], "record.state")?;
    let progress = parse_progress(&record["progress"], "record.progress", "job_record_invalid")?;
    let cancellation = parse_cancellation(&record["cancellation"])?;
    let terminal = parse_terminal_result(&record["terminal"])?;
    let created_at = integer(record, "createdAt", path, "job_timestamp_invalid")?;
    let started_at = nullable_integer(record, "startedAt", path, "job_timestamp_invalid")?;
    let updated_at = integer(record, "updatedAt", path, "job_timestamp_invalid")?;
    let finished_at = nullable_integer(record, "finishedAt", path, "job_timestamp_invalid")?;
    Ok(JobRecordV1 {
        contract_version: CONTRACT_VERSION.to_owned(),
        id: record["id"].as_str().unwrap().to_owned(),
        owner,
        kind: record["kind"].as_str().unwrap().to_owned(),
        trigger,
        state: record_state,
        progress,
        execution_correlation_id: record["executionCorrelationId"]
            .as_str()
            .unwrap()
            .to_owned(),
        cancellation,
        terminal,
        created_at,
        started_at,
        updated_at,
        finished_at,
    })
}

fn parse_event(value: &Value, index: usize) -> Result<JobEventV1, ContractError> {
    let path = format!("events[{index}]");
    let event = object(value, &path, "job_event_invalid")?;
    exact_fields(
        event,
        &[
            "contractVersion",
            "jobId",
            "seq",
            "at",
            "kind",
            "state",
            "data",
        ],
        &path,
        "job_event_invalid",
    )?;
    if string(event, "contractVersion", &path, "job_event_invalid")? != CONTRACT_VERSION {
        return Err(err("job_event_invalid", join(&path, "contractVersion")));
    }
    string(event, "jobId", &path, "job_event_invalid")?;
    let seq = integer(event, "seq", &path, "job_event_sequence_invalid")?;
    let at = integer(event, "at", &path, "job_timestamp_invalid")?;
    let kind = string(event, "kind", &path, "job_event_invalid")?.to_owned();
    let event_state = state(&event["state"], &join(&path, "state"))?;
    let data = object(&event["data"], &join(&path, "data"), "job_event_invalid")?;
    let fields: &[&str] = match kind.as_str() {
        "queued" | "started" => &[],
        "progress" => &["current", "total"],
        "cancellation_requested" => &["reason"],
        "terminal" => &["outcome"],
        _ => return Err(err("job_event_invalid", join(&path, "kind"))),
    };
    exact_fields(data, fields, &join(&path, "data"), "job_event_invalid")?;
    match kind.as_str() {
        "progress" => {
            parse_progress(&event["data"], &join(&path, "data"), "job_event_invalid")?;
        }
        "cancellation_requested" => {
            string(data, "reason", &join(&path, "data"), "job_event_invalid")?;
        }
        "terminal" => {
            terminal(&data["outcome"], &join(&path, "data.outcome"))?;
        }
        _ => {}
    }
    Ok(JobEventV1 {
        contract_version: CONTRACT_VERSION.to_owned(),
        job_id: event["jobId"].as_str().unwrap().to_owned(),
        seq,
        at,
        kind,
        state: event_state,
        data: event["data"].clone(),
    })
}

pub fn validate_job_stream(
    record_value: &Value,
    event_values: &[Value],
) -> Result<ValidatedJobStreamV1, ContractError> {
    let record = parse_record(record_value)?;
    if event_values.is_empty() {
        return Err(err("job_terminal_invalid", "events"));
    }
    if record.cancellation.requested
        && !event_values.iter().any(|event| {
            event.get("kind").and_then(Value::as_str) == Some("cancellation_requested")
        })
    {
        return Err(err("job_cancellation_invalid", "record.cancellation"));
    }
    if matches!(
        record.terminal.as_ref().map(|result| &result.outcome),
        Some(JobTerminalV1::Cancelled)
    ) && !record.cancellation.requested
    {
        return Err(err("job_cancellation_invalid", "record.cancellation"));
    }
    if record.state == JobStateV1::Terminal
        && !event_values
            .iter()
            .any(|event| event.get("kind").and_then(Value::as_str) == Some("terminal"))
    {
        return Err(err("job_terminal_invalid", "events"));
    }
    let mut events = Vec::with_capacity(event_values.len());
    let mut replay_state = JobStateV1::Queued;
    let mut previous_at = None;
    let mut started_at = None;
    let mut latest_progress: Option<JobProgressV1> = None;
    let mut cancellation: Option<(u64, String)> = None;
    let mut terminal_outcome = None;

    for (index, value) in event_values.iter().enumerate() {
        let path = format!("events[{index}]");
        let event = parse_event(value, index)?;
        if event.seq != index as u64 + 1 {
            return Err(err("job_event_sequence_invalid", join(&path, "seq")));
        }
        if event.job_id != record.id {
            return Err(err("job_event_job_mismatch", join(&path, "jobId")));
        }
        if let Some(prior) = previous_at {
            if event.at < prior {
                return Err(err("job_timestamp_invalid", join(&path, "at")));
            }
        }
        if terminal_outcome.is_some() {
            return Err(err(
                if event.kind == "terminal" {
                    "job_terminal_duplicate"
                } else {
                    "job_event_after_terminal"
                },
                path,
            ));
        }
        let expected_state = match event.kind.as_str() {
            "queued" if index == 0 => JobStateV1::Queued,
            "started" if replay_state == JobStateV1::Queued && started_at.is_none() => {
                started_at = Some(event.at);
                JobStateV1::Running
            }
            "progress" if replay_state == JobStateV1::Running => {
                let progress = parse_progress(
                    &event.data,
                    &format!("events[{index}].data"),
                    "job_event_invalid",
                )?;
                if let Some(prior) = &latest_progress {
                    if progress.current < prior.current {
                        return Err(err(
                            "job_event_invalid",
                            format!("events[{index}].data.current"),
                        ));
                    }
                    if progress.total < prior.total {
                        return Err(err(
                            "job_event_invalid",
                            format!("events[{index}].data.total"),
                        ));
                    }
                }
                latest_progress = Some(progress);
                JobStateV1::Running
            }
            "cancellation_requested"
                if matches!(replay_state, JobStateV1::Queued | JobStateV1::Running)
                    && cancellation.is_none() =>
            {
                cancellation = Some((event.at, event.data["reason"].as_str().unwrap().to_owned()));
                JobStateV1::Cancelling
            }
            "terminal" => {
                let outcome = terminal(
                    &event.data["outcome"],
                    &format!("events[{index}].data.outcome"),
                )?;
                let allowed = match outcome {
                    JobTerminalV1::Succeeded | JobTerminalV1::Failed => {
                        replay_state == JobStateV1::Running
                    }
                    JobTerminalV1::Cancelled => replay_state == JobStateV1::Cancelling,
                    JobTerminalV1::Interrupted => matches!(
                        replay_state,
                        JobStateV1::Queued | JobStateV1::Running | JobStateV1::Cancelling
                    ),
                };
                if !allowed {
                    return Err(err("job_state_transition_invalid", join(&path, "kind")));
                }
                terminal_outcome = Some(outcome);
                JobStateV1::Terminal
            }
            _ => return Err(err("job_state_transition_invalid", join(&path, "kind"))),
        };
        if event.state != expected_state {
            return Err(err("job_state_invalid", join(&path, "state")));
        }
        replay_state = expected_state;
        previous_at = Some(event.at);
        events.push(event);
    }

    if record.state != replay_state {
        return Err(err("job_state_invalid", "record.state"));
    }
    if record.created_at != events[0].at
        || record.created_at > record.updated_at
        || record.updated_at != events.last().unwrap().at
    {
        return Err(err(
            "job_timestamp_invalid",
            if record.created_at != events[0].at
                || record.started_at.is_some_and(|at| record.created_at > at)
            {
                "record.createdAt"
            } else {
                "record.updatedAt"
            },
        ));
    }
    if record.started_at != started_at {
        return Err(err("job_timestamp_invalid", "record.startedAt"));
    }
    if let Some((at, reason)) = cancellation {
        if !record.cancellation.requested
            || record.cancellation.requested_at != Some(at)
            || record.cancellation.reason.as_deref() != Some(&reason)
        {
            return Err(err("job_cancellation_invalid", "record.cancellation"));
        }
    } else if record.cancellation.requested
        || matches!(terminal_outcome, Some(JobTerminalV1::Cancelled))
    {
        return Err(err("job_cancellation_invalid", "record.cancellation"));
    }
    let has_progress = latest_progress.is_some();
    let projected = latest_progress.as_ref().unwrap_or(&record.progress);
    if record.progress.current != projected.current {
        return Err(err("job_record_invalid", "record.progress.current"));
    }
    if has_progress && record.progress.total != projected.total {
        return Err(err("job_record_invalid", "record.progress.total"));
    }

    match (&terminal_outcome, &record.terminal, record.finished_at) {
        (None, None, None) => {}
        (None, Some(_), _) => return Err(err("job_terminal_invalid", "record.terminal")),
        (None, None, Some(_)) => return Err(err("job_terminal_invalid", "record.finishedAt")),
        (Some(_), None, _) => return Err(err("job_terminal_invalid", "events")),
        (Some(event_outcome), Some(result), Some(finished_at)) => {
            if event_outcome != &result.outcome {
                return Err(err("job_terminal_invalid", "record.terminal.outcome"));
            }
            if finished_at != events.last().unwrap().at {
                return Err(err("job_terminal_invalid", "record.finishedAt"));
            }
        }
        (Some(_), Some(_), None) => return Err(err("job_terminal_invalid", "record.finishedAt")),
    }
    Ok(ValidatedJobStreamV1 { record, events })
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = include_str!(
        "../../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-valid.json"
    );
    const INVALID: &str = include_str!(
        "../../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-invalid.json"
    );

    fn apply_patch(target: &mut Value, patch: &Value) {
        let operation = patch["op"].as_str().unwrap();
        let parts: Vec<&str> = patch["path"].as_str().unwrap().split('/').skip(1).collect();
        let (parents, leaf) = parts.split_at(parts.len() - 1);
        let mut current = target;
        for part in parents {
            current = if let Ok(index) = part.parse::<usize>() {
                &mut current.as_array_mut().unwrap()[index]
            } else {
                current.get_mut(*part).unwrap()
            };
        }
        match current {
            Value::Object(object) => match operation {
                "add" | "replace" => {
                    object.insert(leaf[0].to_owned(), patch["value"].clone());
                }
                "remove" => {
                    object.remove(leaf[0]).unwrap();
                }
                _ => panic!("unsupported patch operation"),
            },
            Value::Array(array) => match (operation, leaf[0]) {
                ("add", "-") => array.push(patch["value"].clone()),
                ("remove", index) => {
                    array.remove(index.parse().unwrap());
                }
                ("replace", index) => {
                    array[index.parse::<usize>().unwrap()] = patch["value"].clone()
                }
                _ => panic!("unsupported array patch operation"),
            },
            _ => panic!("patch parent is not a container"),
        }
    }

    #[test]
    fn accepts_all_canonical_valid_job_streams() {
        let fixture: Value = serde_json::from_str(VALID).unwrap();
        for case in fixture["input"]["cases"].as_array().unwrap() {
            validate_job_stream(&case["record"], case["events"].as_array().unwrap())
                .unwrap_or_else(|error| {
                    panic!("{}: {} at {}", case["caseId"], error.code, error.path)
                });
        }
    }

    #[test]
    fn rejects_every_canonical_invalid_job_patch_with_exact_error() {
        let valid: Value = serde_json::from_str(VALID).unwrap();
        let invalid: Value = serde_json::from_str(INVALID).unwrap();
        for case in invalid["input"]["cases"].as_array().unwrap() {
            let base_id = case["baseCaseId"].as_str().unwrap();
            let mut candidate = valid["input"]["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["caseId"] == base_id)
                .unwrap()
                .clone();
            for patch in case["patch"].as_array().unwrap() {
                apply_patch(&mut candidate, patch);
            }
            let expected = invalid["expected"]["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["caseId"] == case["caseId"])
                .unwrap();
            let error = validate_job_stream(
                &candidate["record"],
                candidate["events"].as_array().unwrap(),
            )
            .unwrap_err();
            assert_eq!(
                error.code,
                expected["errorCode"].as_str().unwrap(),
                "{} code",
                case["caseId"]
            );
            assert_eq!(
                error.path,
                expected["path"].as_str().unwrap(),
                "{} path",
                case["caseId"]
            );
        }
    }
}
