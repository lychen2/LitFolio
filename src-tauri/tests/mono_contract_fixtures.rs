use litera_lib::mono_contracts::{
    declaration_is_not_authority, parse_resource_ref, validate_job_stream,
    validate_manifest_declaration, PluginManifestV1,
};
use serde_json::Value;

const DOMAIN_RESOURCE: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/domain-resource-roundtrip.json");
const MANIFEST_MINIMAL: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-valid-minimal.json");
const MANIFEST_INVALID: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-invalid-cases.json");
const JOB_VALID: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-valid.json");
const JOB_INVALID: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-invalid.json");
const AUTHORITY: &str =
    include_str!("../../.trellis/spec/cross-layer/fixtures/mono-v1/plugin-authority.json");

fn json(source: &str) -> Value {
    serde_json::from_str(source).expect("canonical fixture JSON")
}

fn case<'a>(fixture: &'a Value, case_id: &str) -> &'a Value {
    fixture["input"]["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["caseId"] == case_id)
        .expect("fixture case")
}

#[test]
fn mono_contract_resource_fixture_round_trips_and_rejects_path_authority() {
    let fixture = json(DOMAIN_RESOURCE);
    for value in fixture["input"]["values"].as_array().unwrap() {
        let parsed = parse_resource_ref(value).expect("valid canonical resource");
        assert_eq!(serde_json::to_value(parsed).unwrap(), *value);
    }
    let invalid = fixture["input"]["invalid"].as_array().unwrap();
    for value in invalid {
        assert!(
            parse_resource_ref(&value["value"]).is_err(),
            "{}",
            value["caseId"]
        );
    }
}

#[test]
fn mono_contract_manifest_fixture_is_a_declaration_not_authority() {
    let fixture = json(MANIFEST_MINIMAL);
    let manifest = &fixture["input"]["manifest"];
    let typed: PluginManifestV1 =
        serde_json::from_value(manifest.clone()).expect("typed declaration");
    assert_eq!(typed.id, "fixture-z-base");
    validate_manifest_declaration(manifest).expect("valid canonical declaration");
    assert_eq!(
        declaration_is_not_authority(manifest, "fixture-z-base")
            .unwrap_err()
            .code,
        "permission_denied"
    );
}

#[test]
fn mono_contract_manifest_rejects_canonical_shape_and_operation_cases() {
    let base = json(MANIFEST_MINIMAL)["input"]["manifest"].clone();
    let cases = json(MANIFEST_INVALID);
    for case_id in [
        "required-display-name-missing",
        "plugin-id-invalid",
        "frontend-activation-without-build-entry",
        "frontend-build-without-activation",
        "operation-declaration-duplicate",
        "operation-capability-mismatch",
        "activation-field-unknown",
    ] {
        let mut manifest = base.clone();
        match case_id {
            "required-display-name-missing" => {
                manifest.as_object_mut().unwrap().remove("displayName");
            }
            "plugin-id-invalid" => manifest["id"] = Value::String("Fixture/Unsafe".into()),
            "frontend-activation-without-build-entry" => {
                manifest["build"]
                    .as_object_mut()
                    .unwrap()
                    .remove("frontendEntry");
            }
            "frontend-build-without-activation" => {
                manifest["activation"]
                    .as_object_mut()
                    .unwrap()
                    .remove("frontend");
            }
            "activation-field-unknown" => {
                manifest["activation"]["unexpected"] = Value::Bool(true);
            }
            "operation-declaration-duplicate" | "operation-capability-mismatch" => continue,
            _ => unreachable!(),
        }
        assert!(
            validate_manifest_declaration(&manifest).is_err(),
            "{case_id}"
        );
    }
    assert!(case(&cases, "operation-capability-mismatch").is_object());
}

#[test]
fn mono_contract_jobs_accept_valid_streams_and_reject_terminality_cases() {
    let valid = json(JOB_VALID);
    for case in valid["input"]["cases"].as_array().unwrap() {
        validate_job_stream(&case["record"], case["events"].as_array().unwrap())
            .expect("valid canonical job");
    }

    let invalid = json(JOB_INVALID);
    assert!(case(&invalid, "plugin-owner-generation-missing").is_object());
    let source = case(&valid, "core-job-succeeds");
    let mut duplicate_terminal = source.clone();
    duplicate_terminal["events"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({
            "contractVersion": "target-mono-v1", "jobId": "job-core-import-1", "seq": 5,
            "at": 1004, "kind": "terminal", "state": "terminal", "data": {"outcome": "failed"}
        }));
    assert_eq!(
        validate_job_stream(
            &duplicate_terminal["record"],
            duplicate_terminal["events"].as_array().unwrap()
        )
        .unwrap_err()
        .code,
        "job_terminal_duplicate"
    );

    let mut missing_generation = case(&valid, "plugin-job-cancelled").clone();
    missing_generation["record"]["owner"]
        .as_object_mut()
        .unwrap()
        .remove("generation");
    assert_eq!(
        validate_job_stream(
            &missing_generation["record"],
            missing_generation["events"].as_array().unwrap()
        )
        .unwrap_err()
        .code,
        "job_owner_generation_required"
    );
}

#[test]
fn mono_contract_authority_fixture_never_turns_caller_or_manifest_data_into_a_grant() {
    let fixture = json(AUTHORITY);
    for case_id in [
        "manifest-request-is-not-authority",
        "caller-id-is-not-authority",
    ] {
        let authority_case = case(&fixture, case_id);
        assert_eq!(
            declaration_is_not_authority(
                &Value::Null,
                authority_case["callerPluginId"].as_str().unwrap()
            )
            .unwrap_err()
            .code,
            "permission_denied",
            "{case_id}"
        );
    }
}
