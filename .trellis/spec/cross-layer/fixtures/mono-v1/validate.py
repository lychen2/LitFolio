#!/usr/bin/env python3
"""Validate planned target-mono-v1 JSON fixtures with the Python standard library."""

from __future__ import annotations

import ast
import copy
import hashlib
import heapq
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
VERSION = "target-mono-v1"
STATUS = "planned-unimplemented"
CANONICAL_JSON_NAME = "MonoCanonicalJsonV1"
JSON_SAFE_INTEGER = 9_007_199_254_740_991
QUOTA_WINDOW_MS = 60_000
PLUGIN_ID = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
ASCII_IDENTIFIER = re.compile(r"^[\x21-\x7e]+$")
SEMVER_PRERELEASE_IDENTIFIER = (
    r"(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
)
SEMVER_PATTERN = (
    r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    rf"(?:-({SEMVER_PRERELEASE_IDENTIFIER}(?:\.{SEMVER_PRERELEASE_IDENTIFIER})*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
)
SEMVER = re.compile(rf"^{SEMVER_PATTERN}$")
SEMVER_RANGE = re.compile(rf"^[\^~]?{SEMVER_PATTERN}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
ERROR_CODE = re.compile(r"^[a-z][a-z0-9_]*$")
PLAN_STABLE_ERROR_CODES = {
    "ai_cancelled",
    "ai_profile_invalid",
    "ai_profile_missing",
    "ai_request_failed",
    "annotation_revision_conflict",
    "operation_limit_exceeded",
    "permission_denied",
    "plugin_activation_failed",
    "plugin_dependency_missing",
    "plugin_disable_timeout",
    "plugin_disabled",
    "plugin_excluded",
    "plugin_incompatible",
    "plugin_instance_missing",
    "plugin_instance_stale",
    "proposal_conflict",
    "proposal_invalid",
    "scope_not_approved",
}
ERROR_CODES_BY_CATEGORY = {
    "ai": {
        "ai_cancelled", "ai_profile_invalid", "ai_profile_missing", "ai_request_failed",
    },
    "annotation": {"annotation_revision_conflict"},
    "authority": {"permission_denied", "plugin_instance_missing", "plugin_instance_stale"},
    "dependency": {
        "plugin_dependency_cycle", "plugin_dependency_missing",
        "plugin_dependency_version_mismatch",
    },
    "job": {
        "job_cancellation_invalid", "job_event_after_terminal", "job_event_invalid",
        "job_event_job_mismatch", "job_event_sequence_invalid", "job_owner_generation_required",
        "job_record_invalid", "job_state_invalid", "job_state_transition_invalid",
        "job_terminal_duplicate", "job_terminal_invalid", "job_timestamp_invalid",
    },
    "lifecycle": {
        "plugin_activation_failed", "plugin_disable_timeout", "plugin_disabled",
        "plugin_excluded", "plugin_incompatible",
    },
    "manifest": {
        "manifest_api_version_unsupported", "manifest_backend_activation_missing",
        "manifest_backend_build_missing", "manifest_capability_unsupported",
        "manifest_contribution_operation_undeclared", "manifest_contribution_slot_unsupported",
        "manifest_core_api_range_invalid", "manifest_export_duplicate", "manifest_field_required",
        "manifest_frontend_activation_missing", "manifest_frontend_build_missing",
        "manifest_id_invalid", "manifest_migration_chain_invalid", "manifest_operation_invalid",
        "manifest_semver_invalid", "manifest_storage_invalid", "manifest_unknown_field",
    },
    "proposal": {"proposal_conflict", "proposal_invalid"},
    "resource": {"domain_ref_invalid", "resource_ref_invalid"},
    "scope": {"operation_limit_exceeded", "scope_not_approved"},
    "startup-network": {
        "network_observer_invalid", "startup_phase_invalid", "startup_readiness_invalid",
        "startup_scenario_invalid", "zero_network_startup_failed",
    },
}
ERROR_CATEGORIES = set(ERROR_CODES_BY_CATEGORY)
EXPECTED_ERROR_CATEGORY = {
    code: category
    for category, category_codes in ERROR_CODES_BY_CATEGORY.items()
    for code in category_codes
}
CAPABILITIES = {
    "papers", "annotations", "reader", "ai", "storage", "files", "network",
    "secrets", "jobs", "events", "ui", "i18n", "logger",
}
OPERATION_SEGMENT = r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
OPERATION = re.compile(
    rf"^(?P<capability>{'|'.join(sorted(CAPABILITIES))})\."
    rf"{OPERATION_SEGMENT}(?:\.{OPERATION_SEGMENT})*$"
)
SLOTS = {
    "app.routes", "app.navigation", "app.commandPalette", "settings.sections",
    "library.toolbarActions", "library.rowActions", "library.detailSections",
    "library.filters", "import.sources", "reader.toolbarActions",
    "reader.selectionActions", "reader.sidePanels", "reader.annotationDecorators",
    "export.formats", "paper.detailActions", "jobs.renderers",
}
DOMAINS = {"paper", "annotation", "document-revision", "source-segment", "note", "job"}
TERMINALS = {"succeeded", "failed", "cancelled", "interrupted"}
JOB_STATES = {"queued", "running", "cancelling", "terminal"}
STARTUP_READINESS = ["library-ready", "reader-pdf-ready"]
STARTUP_PHASES = ["cold-boot", "readiness", "idle"]
STARTUP_OBSERVERS = [
    "frontend.fetch",
    "frontend.xml-http-request",
    "frontend.web-socket",
    "frontend.event-source",
    "frontend.send-beacon",
    "tauri.updater",
    "backend.api-client",
    "backend.external-client",
    "host.network-adapter",
    "scheduler.network-capable-timer",
    "webview.process-image-request",
    "webview.process-style-request",
    "webview.process-media-request",
    "webview.process-frame-request",
    "webview.process-worker-request",
    "webview.process-navigation",
    "webview.csp-denied-attempt",
]
STARTUP_CONTROLS = {
    "frontend-denied-fetch": "frontend.fetch",
    "frontend-denied-xml-http-request": "frontend.xml-http-request",
    "frontend-denied-web-socket": "frontend.web-socket",
    "frontend-denied-event-source": "frontend.event-source",
    "frontend-denied-send-beacon": "frontend.send-beacon",
    "updater-denied-check": "tauri.updater",
    "backend-denied-api-client": "backend.api-client",
    "backend-denied-external-client": "backend.external-client",
    "backend-denied-host-request": "host.network-adapter",
    "scheduler-denied-network-capable-timer": "scheduler.network-capable-timer",
    "webview-denied-image-request": "webview.process-image-request",
    "webview-denied-style-request": "webview.process-style-request",
    "webview-denied-media-request": "webview.process-media-request",
    "webview-denied-frame-request": "webview.process-frame-request",
    "webview-denied-worker-request": "webview.process-worker-request",
    "webview-denied-navigation": "webview.process-navigation",
    "webview-csp-denied-attempt": "webview.csp-denied-attempt",
}


REQUIRED_PROBE_CASES = {
    "manifest": {
        "api-version-bool", "manifest-semver-leading-zero",
        "manifest-prerelease-leading-zero", "manifest-semver-non-ascii-digit",
        "required-absent-dependency-range-invalid",
        "optional-absent-dependency-range-invalid", "operation-empty",
        "operation-leading-dot", "operation-segment-malformed",
        "operation-capability-mismatch", "contribution-order-bool",
        "storage-schema-version-bool", "capability-limit-bool",
        "capability-scope-field-unknown", "frontend-contribution-without-frontend-surface",
        "backend-migration-without-backend-surface",
    },
    "registry": {
        "compile-target-core-api-version-missing",
        "compile-target-core-api-version-is-range",
        "compile-target-core-api-version-incompatible",
    },
    "authority-admission": {
        "live-exact-grant", "live-exact-limit-boundary",
        "manifest-request-is-not-authority", "caller-id-is-not-authority",
        "stale-generation-denied", "live-binding-without-operation-grant",
        "resource-scope-denied", "resource-revision-scope-denied",
        "per-request-quota-denied", "window-quota-denied",
        "concurrent-reservation-quota-denied", "per-use-consent-valid",
        "missing-per-use-consent-denied", "approved-schedule-consent-valid",
        "invalid-scheduled-consent-denied",
    },
    "authority-binding": {
        "grant-principal-generation-mismatch", "grant-limit-bool",
        "grant-scope-field-unknown", "grant-operation-empty",
        "grant-operation-leading-dot", "grant-operation-segment-malformed",
        "grant-operation-capability-unknown",
    },
    "authority-request": {
        "request-operation-empty", "request-operation-leading-dot",
        "request-operation-segment-malformed", "request-operation-capability-unknown",
        "stale-self-reported-window-state-denied",
    },
    "resource": {
        "domain-unknown", "resource-exposes-path", "domain-id-not-string",
        "domain-id-non-ascii", "revision-value-not-string",
    },
    "job-valid": {
        "core-job-queued", "core-job-running", "plugin-job-cancelling",
        "core-job-succeeds", "plugin-job-cancelled",
    },
    "job-invalid": {
        "plugin-owner-generation-missing", "event-sequence-duplicate",
        "event-sequence-bool", "terminal-outcome-duplicate", "event-after-terminal",
        "cancellation-record-without-event", "terminal-record-event-mismatch",
        "event-state-mismatch", "record-state-mismatch", "terminal-finished-at-mismatch",
        "queued-record-has-terminal", "running-record-has-finished-at",
        "terminal-record-missing-terminal-event", "progress-before-started",
        "cancelled-without-cancellation-request", "succeeded-after-cancellation",
        "event-time-decreases", "record-created-after-started",
        "record-started-at-event-mismatch", "record-id-not-string",
        "event-time-bool", "progress-current-bool",
        "record-progress-current-mismatch", "record-progress-total-mismatch",
        "progress-event-current-decreases", "progress-event-total-decreases",
    },
    "startup": {
        "observer-coverage-missing", "readiness-coverage-missing",
        "phase-coverage-missing", "expected-scenario-missing",
        "observer-without-positive-control", "positive-control-id-duplicate",
        "positive-control-observer-duplicate", "positive-control-evidence-missing",
        "positive-control-evidence-mismatch", "positive-control-evidence-zero",
        "reported-observer-coverage-missing", "webview-process-observer-coverage-missing",
        "webview-csp-positive-control-evidence-missing",
    },
}


class ContractFailure(Exception):
    def __init__(self, code: str, path: str):
        super().__init__(f"{code} at {path}")
        self.code = code
        self.path = path


def require_fields(value: dict[str, Any], fields: set[str], path: str) -> None:
    missing = sorted(fields - set(value))
    if missing:
        child = f"{path}.{missing[0]}" if path else missing[0]
        raise ContractFailure("manifest_field_required", child)
    extra = sorted(set(value) - fields)
    if extra:
        child = f"{path}.{extra[0]}" if path else extra[0]
        raise ContractFailure("manifest_unknown_field", child)


def require_fields_return(value: Any, fields: set[str], path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractFailure("manifest_field_required", path)
    require_fields(value, fields, path)
    return value


def require_exact_fields(
    value: Any,
    fields: set[str],
    path: str,
    invalid_code: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractFailure(invalid_code, path)
    missing = sorted(fields - set(value))
    if missing:
        raise ContractFailure(invalid_code, f"{path}.{missing[0]}")
    extra = sorted(set(value) - fields)
    if extra:
        raise ContractFailure(invalid_code, f"{path}.{extra[0]}")
    return value


def require_allowed_fields(value: Any, fields: set[str], path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractFailure("manifest_field_required", path)
    extra = sorted(set(value) - fields)
    if extra:
        raise ContractFailure("manifest_unknown_field", f"{path}.{extra[0]}")
    return value


def reject_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for name, member in pairs:
        if name in value:
            raise ValueError(f"duplicate JSON member: {name!r}")
        value[name] = member
    return value


def strict_json_loads(raw: str) -> Any:
    return json.loads(raw, object_pairs_hook=reject_duplicate_members)


def require_nonempty_string(value: Any, code: str, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractFailure(code, path)
    return value


def require_ascii_identifier(value: Any, code: str, path: str) -> str:
    if not isinstance(value, str) or not ASCII_IDENTIFIER.fullmatch(value):
        raise ContractFailure(code, path)
    return value


def is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_valid_operation(value: Any, capability: str | None = None) -> bool:
    if not isinstance(value, str):
        return False
    match = OPERATION.fullmatch(value)
    return match is not None and (
        capability is None or match.group("capability") == capability
    )


def parse_semver(value: str) -> tuple[int, int, int, tuple[tuple[int, int | str], ...] | None]:
    match = SEMVER.fullmatch(value)
    if match is None:
        raise ValueError(f"invalid SemVer 2 value: {value!r}")
    prerelease = match.group(4)
    parsed_prerelease = None
    if prerelease is not None:
        parsed_prerelease = tuple(
            (0, int(identifier)) if re.fullmatch(r"[0-9]+", identifier) else (1, identifier)
            for identifier in prerelease.split(".")
        )
    return int(match.group(1)), int(match.group(2)), int(match.group(3)), parsed_prerelease


def compare_semver(
    left: tuple[int, int, int, tuple[tuple[int, int | str], ...] | None],
    right: tuple[int, int, int, tuple[tuple[int, int | str], ...] | None],
) -> int:
    if left[:3] != right[:3]:
        return -1 if left[:3] < right[:3] else 1
    left_pre, right_pre = left[3], right[3]
    if left_pre is None or right_pre is None:
        if left_pre is right_pre:
            return 0
        return 1 if left_pre is None else -1
    for left_id, right_id in zip(left_pre, right_pre):
        if left_id != right_id:
            return -1 if left_id < right_id else 1
    if len(left_pre) == len(right_pre):
        return 0
    return -1 if len(left_pre) < len(right_pre) else 1


def version_satisfies(version: str, requirement: str) -> bool:
    current = parse_semver(version)
    prefix = requirement[:1] if requirement.startswith(("^", "~")) else ""
    base = parse_semver(requirement[1:] if prefix else requirement)
    if not prefix:
        return compare_semver(current, base) == 0
    if compare_semver(current, base) < 0:
        return False
    major, minor, patch = base[:3]
    if prefix == "~":
        upper = (major, minor + 1, 0, None)
    elif major > 0:
        upper = (major + 1, 0, 0, None)
    elif minor > 0:
        upper = (0, minor + 1, 0, None)
    else:
        upper = (0, 0, patch + 1, None)
    return compare_semver(current, upper) < 0


def validate_manifest(manifest: dict[str, Any], available: dict[str, dict[str, Any]]) -> None:
    require_fields(manifest, {
        "apiVersion", "id", "version", "coreApi", "displayName", "activation",
        "dependencies", "requestedCapabilities", "contributions", "storage",
        "migrations", "build",
    }, "")
    if not is_integer(manifest["apiVersion"]) or manifest["apiVersion"] != 1:
        raise ContractFailure("manifest_api_version_unsupported", "apiVersion")
    if not isinstance(manifest["id"], str) or not PLUGIN_ID.fullmatch(manifest["id"]):
        raise ContractFailure("manifest_id_invalid", "id")
    if not isinstance(manifest["version"], str) or not SEMVER.fullmatch(manifest["version"]):
        raise ContractFailure("manifest_semver_invalid", "version")
    if not isinstance(manifest["coreApi"], str) or not SEMVER_RANGE.fullmatch(manifest["coreApi"]):
        raise ContractFailure("manifest_core_api_range_invalid", "coreApi")
    require_nonempty_string(manifest["displayName"], "manifest_field_required", "displayName")

    activation = require_allowed_fields(manifest["activation"], {"frontend", "backend"}, "activation")
    build = require_allowed_fields(manifest["build"], {"frontendEntry", "rustFeature"}, "build")
    frontend = activation.get("frontend")
    backend = activation.get("backend")
    if frontend is not None:
        frontend = require_fields_return(frontend, {"export"}, "activation.frontend")
        require_nonempty_string(frontend["export"], "manifest_field_required", "activation.frontend.export")
    if backend is not None:
        backend = require_fields_return(backend, {"commandSlice"}, "activation.backend")
        require_nonempty_string(backend["commandSlice"], "manifest_field_required", "activation.backend.commandSlice")
    for field in ("frontendEntry", "rustFeature"):
        if field in build:
            require_nonempty_string(build[field], "manifest_field_required", f"build.{field}")
    if "frontend" in activation and not build.get("frontendEntry"):
        raise ContractFailure("manifest_frontend_build_missing", "build.frontendEntry")
    if "backend" in activation and not build.get("rustFeature"):
        raise ContractFailure("manifest_backend_build_missing", "build.rustFeature")
    if build.get("frontendEntry") and "frontend" not in activation:
        raise ContractFailure("manifest_frontend_activation_missing", "activation.frontend")
    if build.get("rustFeature") and "backend" not in activation:
        raise ContractFailure("manifest_backend_activation_missing", "activation.backend")

    if not isinstance(manifest["dependencies"], list):
        raise ContractFailure("manifest_field_required", "dependencies")
    seen_dependencies: set[str] = set()
    for index, dependency_value in enumerate(manifest["dependencies"]):
        dependency = require_fields_return(
            dependency_value,
            {"id", "version", "optional"},
            f"dependencies[{index}]",
        )
        dep_id = dependency["id"]
        requirement = dependency["version"]
        if not isinstance(dep_id, str) or not PLUGIN_ID.fullmatch(dep_id):
            raise ContractFailure("manifest_id_invalid", f"dependencies[{index}].id")
        if dep_id == manifest["id"] or dep_id in seen_dependencies:
            raise ContractFailure("plugin_dependency_cycle", f"dependencies[{index}].id")
        seen_dependencies.add(dep_id)
        if not isinstance(dependency["optional"], bool):
            raise ContractFailure("manifest_field_required", f"dependencies[{index}].optional")
        if not isinstance(requirement, str) or not SEMVER_RANGE.fullmatch(requirement):
            raise ContractFailure("manifest_semver_invalid", f"dependencies[{index}].version")
        if dep_id not in available:
            if dependency["optional"]:
                continue
            raise ContractFailure("plugin_dependency_missing", f"dependencies[{index}].id")
        if not version_satisfies(available[dep_id]["version"], requirement):
            raise ContractFailure("plugin_dependency_version_mismatch", f"dependencies[{index}].version")

    if not isinstance(manifest["requestedCapabilities"], list):
        raise ContractFailure("manifest_field_required", "requestedCapabilities")
    requested_operations: set[str] = set()
    seen_capabilities: set[str] = set()
    for index, request_value in enumerate(manifest["requestedCapabilities"]):
        request = require_fields_return(
            request_value,
            {"capability", "operations", "required", "scope", "limits"},
            f"requestedCapabilities[{index}]",
        )
        capability = request["capability"]
        if (
            not isinstance(capability, str)
            or capability not in CAPABILITIES
            or capability in seen_capabilities
        ):
            raise ContractFailure(
                "manifest_capability_unsupported",
                f"requestedCapabilities[{index}].capability",
            )
        seen_capabilities.add(capability)
        if not isinstance(request["operations"], list) or not request["operations"]:
            raise ContractFailure(
                "manifest_operation_invalid",
                f"requestedCapabilities[{index}].operations",
            )
        if not isinstance(request["required"], bool):
            raise ContractFailure("manifest_field_required", f"requestedCapabilities[{index}].required")
        for op_index, operation in enumerate(request["operations"]):
            if (
                not is_valid_operation(operation, capability)
                or operation in requested_operations
            ):
                raise ContractFailure(
                    "manifest_operation_invalid",
                    f"requestedCapabilities[{index}].operations[{op_index}]",
                )
            requested_operations.add(operation)

        scope = require_fields_return(
            request["scope"],
            {"resourceDomains", "contributionSlots", "jobKinds"},
            f"requestedCapabilities[{index}].scope",
        )
        scope_rules = (
            ("resourceDomains", DOMAINS),
            ("contributionSlots", SLOTS),
        )
        for field, allowed in scope_rules:
            values = scope[field]
            if not isinstance(values, list):
                raise ContractFailure(
                    "manifest_field_required",
                    f"requestedCapabilities[{index}].scope.{field}",
                )
            seen_values: set[str] = set()
            for value_index, value in enumerate(values):
                if not isinstance(value, str) or value not in allowed or value in seen_values:
                    raise ContractFailure(
                        "manifest_capability_unsupported",
                        f"requestedCapabilities[{index}].scope.{field}[{value_index}]",
                    )
                seen_values.add(value)
        job_kinds = scope["jobKinds"]
        if not isinstance(job_kinds, list):
            raise ContractFailure(
                "manifest_field_required",
                f"requestedCapabilities[{index}].scope.jobKinds",
            )
        seen_job_kinds: set[str] = set()
        for job_index, job_kind in enumerate(job_kinds):
            if (
                not isinstance(job_kind, str)
                or not ASCII_IDENTIFIER.fullmatch(job_kind)
                or job_kind in seen_job_kinds
            ):
                raise ContractFailure(
                    "manifest_capability_unsupported",
                    f"requestedCapabilities[{index}].scope.jobKinds[{job_index}]",
                )
            seen_job_kinds.add(job_kind)

        limits = require_fields_return(
            request["limits"],
            {"maxUnitsPerRequest", "maxUnitsPerWindow"},
            f"requestedCapabilities[{index}].limits",
        )
        for field in ("maxUnitsPerRequest", "maxUnitsPerWindow"):
            if not is_integer(limits[field]) or limits[field] < 1:
                raise ContractFailure(
                    "manifest_field_required",
                    f"requestedCapabilities[{index}].limits.{field}",
                )

    if not isinstance(manifest["contributions"], list):
        raise ContractFailure("manifest_field_required", "contributions")
    if manifest["contributions"]:
        if frontend is None:
            raise ContractFailure("manifest_frontend_activation_missing", "activation.frontend")
        if not build.get("frontendEntry"):
            raise ContractFailure("manifest_frontend_build_missing", "build.frontendEntry")
    seen_contributions: set[str] = set()
    seen_frontend_exports = {frontend["export"]} if frontend else set()
    for index, contribution_value in enumerate(manifest["contributions"]):
        contribution = require_fields_return(
            contribution_value,
            {"id", "slot", "frontendExport", "requiredOperations", "order"},
            f"contributions[{index}]",
        )
        contribution_id = contribution["id"]
        if (
            not isinstance(contribution_id, str)
            or not ASCII_IDENTIFIER.fullmatch(contribution_id)
            or contribution_id in seen_contributions
        ):
            raise ContractFailure("manifest_field_required", f"contributions[{index}].id")
        seen_contributions.add(contribution_id)
        slot = contribution["slot"]
        if not isinstance(slot, str) or slot not in SLOTS:
            raise ContractFailure("manifest_contribution_slot_unsupported", f"contributions[{index}].slot")
        frontend_export = require_nonempty_string(
            contribution["frontendExport"],
            "manifest_field_required",
            f"contributions[{index}].frontendExport",
        )
        if frontend_export in seen_frontend_exports:
            raise ContractFailure("manifest_export_duplicate", f"contributions[{index}].frontendExport")
        seen_frontend_exports.add(frontend_export)
        if not is_integer(contribution["order"]):
            raise ContractFailure("manifest_field_required", f"contributions[{index}].order")
        if not isinstance(contribution["requiredOperations"], list):
            raise ContractFailure("manifest_field_required", f"contributions[{index}].requiredOperations")
        seen_required_operations: set[str] = set()
        for op_index, operation in enumerate(contribution["requiredOperations"]):
            if not isinstance(operation, str) or operation in seen_required_operations:
                raise ContractFailure("manifest_operation_invalid", f"contributions[{index}].requiredOperations[{op_index}]")
            seen_required_operations.add(operation)
            if operation not in requested_operations:
                raise ContractFailure(
                    "manifest_contribution_operation_undeclared",
                    f"contributions[{index}].requiredOperations[{op_index}]",
                )

    storage = require_fields_return(
        manifest["storage"],
        {"kind", "schemaVersion", "retention"},
        "storage",
    )
    migrations = manifest["migrations"]
    if not isinstance(migrations, list):
        raise ContractFailure("manifest_field_required", "migrations")
    if migrations:
        if backend is None:
            raise ContractFailure("manifest_backend_activation_missing", "activation.backend")
        if not build.get("rustFeature"):
            raise ContractFailure("manifest_backend_build_missing", "build.rustFeature")
    if storage["retention"] != "preserve-on-disable":
        raise ContractFailure("manifest_storage_invalid", "storage.retention")
    if storage["kind"] == "none":
        if not is_integer(storage["schemaVersion"]) or storage["schemaVersion"] != 0:
            raise ContractFailure("manifest_storage_invalid", "storage.schemaVersion")
        if migrations:
            raise ContractFailure("manifest_storage_invalid", "storage")
    elif storage["kind"] == "sidecar-sqlite":
        schema_version = storage["schemaVersion"]
        if not is_integer(schema_version) or schema_version < 1:
            raise ContractFailure("manifest_storage_invalid", "storage.schemaVersion")
        expected_from = 0
        seen_migrations: set[str] = set()
        seen_migration_exports: set[str] = set()
        for index, migration_value in enumerate(migrations):
            migration = require_fields_return(
                migration_value,
                {"id", "fromVersion", "toVersion", "backendExport", "sha256"},
                f"migrations[{index}]",
            )
            from_version = migration["fromVersion"]
            if not is_integer(from_version) or from_version != expected_from:
                raise ContractFailure("manifest_migration_chain_invalid", f"migrations[{index}].fromVersion")
            to_version = migration["toVersion"]
            if not is_integer(to_version) or to_version != expected_from + 1:
                raise ContractFailure("manifest_migration_chain_invalid", f"migrations[{index}].toVersion")
            migration_id = require_ascii_identifier(
                migration["id"], "manifest_migration_chain_invalid", f"migrations[{index}].id"
            )
            sha256 = migration["sha256"]
            if (
                migration_id in seen_migrations
                or not isinstance(sha256, str)
                or not SHA256.fullmatch(sha256)
            ):
                raise ContractFailure("manifest_migration_chain_invalid", f"migrations[{index}]")
            seen_migrations.add(migration_id)
            backend_export = require_nonempty_string(
                migration["backendExport"],
                "manifest_migration_chain_invalid",
                f"migrations[{index}].backendExport",
            )
            if backend_export in seen_migration_exports:
                raise ContractFailure("manifest_export_duplicate", f"migrations[{index}].backendExport")
            seen_migration_exports.add(backend_export)
            expected_from = to_version
        if expected_from != schema_version:
            raise ContractFailure("manifest_migration_chain_invalid", "migrations")
    else:
        raise ContractFailure("manifest_storage_invalid", "storage.kind")


def required_dependency_order(manifests: list[dict[str, Any]]) -> list[str]:
    by_id: dict[str, dict[str, Any]] = {}
    for manifest in manifests:
        plugin_id = manifest["id"]
        if plugin_id in by_id:
            raise ContractFailure("manifest_id_invalid", f"manifests.{plugin_id}.id")
        by_id[plugin_id] = manifest

    in_degree = {plugin_id: 0 for plugin_id in by_id}
    dependents: dict[str, list[str]] = {plugin_id: [] for plugin_id in by_id}
    dependency_indexes: dict[tuple[str, str], int] = {}
    for plugin_id, manifest in by_id.items():
        for index, dependency in enumerate(manifest["dependencies"]):
            if dependency["optional"]:
                continue
            dependency_id = dependency["id"]
            if dependency_id not in by_id:
                raise ContractFailure(
                    "plugin_dependency_missing",
                    f"manifests.{plugin_id}.dependencies[{index}].id",
                )
            in_degree[plugin_id] += 1
            dependents[dependency_id].append(plugin_id)
            dependency_indexes[(plugin_id, dependency_id)] = index

    ready = [plugin_id for plugin_id, count in in_degree.items() if count == 0]
    heapq.heapify(ready)
    ordered: list[str] = []
    while ready:
        plugin_id = heapq.heappop(ready)
        ordered.append(plugin_id)
        for dependent_id in sorted(dependents[plugin_id]):
            in_degree[dependent_id] -= 1
            if in_degree[dependent_id] == 0:
                heapq.heappush(ready, dependent_id)

    if len(ordered) != len(by_id):
        blocked_id = min(plugin_id for plugin_id, count in in_degree.items() if count > 0)
        blocked_dependency_id = min(
            dependency["id"]
            for dependency in by_id[blocked_id]["dependencies"]
            if not dependency["optional"] and in_degree[dependency["id"]] > 0
        )
        index = dependency_indexes[(blocked_id, blocked_dependency_id)]
        raise ContractFailure(
            "plugin_dependency_cycle",
            f"manifests.{blocked_id}.dependencies[{index}].id",
        )
    return ordered


def apply_patch(value: Any, operations: list[dict[str, Any]]) -> Any:
    result = copy.deepcopy(value)
    for operation in operations:
        tokens = [token.replace("~1", "/").replace("~0", "~") for token in operation["path"].split("/")[1:]]
        parent = result
        for token in tokens[:-1]:
            parent = parent[int(token)] if isinstance(parent, list) else parent[token]
        leaf = tokens[-1]
        if operation["op"] == "remove":
            if isinstance(parent, list):
                parent.pop(int(leaf))
            else:
                del parent[leaf]
        elif operation["op"] in {"add", "replace"}:
            replacement = copy.deepcopy(operation.get("value"))
            if isinstance(parent, list):
                if leaf == "-":
                    parent.append(replacement)
                elif operation["op"] == "add":
                    parent.insert(int(leaf), replacement)
                else:
                    parent[int(leaf)] = replacement
            else:
                parent[leaf] = replacement
        else:
            raise AssertionError(f"unsupported patch operation: {operation['op']}")
    return result


def _canonical_json_string(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value)
    escaped: list[str] = ['"']
    short_escapes = {
        '"': '\\"',
        "\\": "\\\\",
        "\b": "\\b",
        "\t": "\\t",
        "\n": "\\n",
        "\f": "\\f",
        "\r": "\\r",
    }
    for character in normalized:
        codepoint = ord(character)
        if 0xD800 <= codepoint <= 0xDFFF:
            raise ValueError("MonoCanonicalJsonV1 rejects lone surrogate code points")
        if character in short_escapes:
            escaped.append(short_escapes[character])
        elif codepoint <= 0x1F:
            escaped.append(f"\\u{codepoint:04x}")
        else:
            escaped.append(character)
    escaped.append('"')
    return "".join(escaped)


def mono_canonical_json_v1(value: Any) -> bytes:
    def encode(item: Any) -> str:
        if item is None:
            return "null"
        if item is True:
            return "true"
        if item is False:
            return "false"
        if is_integer(item):
            if not -JSON_SAFE_INTEGER <= item <= JSON_SAFE_INTEGER:
                raise ValueError("MonoCanonicalJsonV1 integer exceeds cross-language safe range")
            return str(item)
        if isinstance(item, float):
            raise ValueError("MonoCanonicalJsonV1 accepts integer numeric values only")
        if isinstance(item, str):
            return _canonical_json_string(item)
        if isinstance(item, list):
            return "[" + ",".join(encode(member) for member in item) + "]"
        if isinstance(item, dict):
            for key in item:
                if not isinstance(key, str) or not key.isascii():
                    raise ValueError("MonoCanonicalJsonV1 object keys must be ASCII strings")
            members = (
                _canonical_json_string(key) + ":" + encode(item[key])
                for key in sorted(item, key=lambda member: member.encode("utf-8"))
            )
            return "{" + ",".join(members) + "}"
        raise ValueError(f"MonoCanonicalJsonV1 unsupported value: {type(item).__name__}")

    return encode(value).encode("utf-8")


def plan_digest(manifests: list[dict[str, Any]], target_core_api_version: str) -> str:
    value = {
        "contractVersion": VERSION,
        "targetCoreApiVersion": target_core_api_version,
        "manifests": manifests,
    }
    return hashlib.sha256(mono_canonical_json_v1(value)).hexdigest()


def compile_registry(
    manifest_docs: list[dict[str, Any]], target_core_api_version: str
) -> dict[str, Any]:
    unordered_manifests = [doc["input"]["manifest"] for doc in manifest_docs]
    if not isinstance(target_core_api_version, str) or not SEMVER.fullmatch(target_core_api_version):
        raise ContractFailure("manifest_core_api_range_invalid", "input.targetCoreApiVersion")
    for manifest in unordered_manifests:
        if not version_satisfies(target_core_api_version, manifest["coreApi"]):
            raise ContractFailure(
                "plugin_incompatible", f"manifests.{manifest['id']}.coreApi"
            )
    dependency_order = required_dependency_order(unordered_manifests)
    docs_by_plugin_id = {
        doc["input"]["manifest"]["id"]: doc for doc in manifest_docs
    }
    ordered = [docs_by_plugin_id[plugin_id] for plugin_id in dependency_order]
    manifests = [doc["input"]["manifest"] for doc in ordered]
    digest = plan_digest(manifests, target_core_api_version)
    plugins = [
        {"id": manifest["id"], "version": manifest["version"], "manifestFixtureId": doc["fixtureId"]}
        for doc, manifest in zip(ordered, manifests)
    ]
    frontend = []
    rust = []
    backend = []
    runtime = []
    mocks = []
    conversion = []
    for manifest in manifests:
        plugin_id = manifest["id"]
        front = manifest["activation"].get("frontend")
        back = manifest["activation"].get("backend")
        if front:
            frontend.append({
                "pluginId": plugin_id,
                "entry": manifest["build"]["frontendEntry"],
                "activationExport": front["export"],
            })
        if manifest["build"].get("rustFeature"):
            rust.append({"pluginId": plugin_id, "feature": manifest["build"]["rustFeature"]})
        if back:
            backend.append({"pluginId": plugin_id, "commandSlice": back["commandSlice"]})
        runtime.append({
            "pluginId": plugin_id,
            "version": manifest["version"],
            "frontend": bool(front),
            "backend": bool(back),
        })
        exports = ([front["export"]] if front else []) + [item["frontendExport"] for item in manifest["contributions"]]
        mocks.append({
            "pluginId": plugin_id,
            "frontendExports": sorted(exports),
            "backendCommandSlices": [back["commandSlice"]] if back else [],
        })
        conversion.append({
            "pluginId": plugin_id,
            "storageKind": manifest["storage"]["kind"],
            "schemaVersion": manifest["storage"]["schemaVersion"],
            "migrationIds": [item["id"] for item in manifest["migrations"]],
        })
    return {
        "plan": {
            "contractVersion": VERSION,
            "targetCoreApiVersion": target_core_api_version,
            "canonicalization": CANONICAL_JSON_NAME,
            "planDigest": digest,
            "plugins": plugins,
        },
        "registries": {
            "frontend": {"planDigest": digest, "entries": frontend},
            "rust": {"planDigest": digest, "features": rust},
            "backend": {"planDigest": digest, "slices": backend},
            "runtime": {"planDigest": digest, "entries": runtime},
            "mocks": {"planDigest": digest, "entries": mocks},
            "conversion": {"planDigest": digest, "owners": conversion},
        },
    }


def compile_registry_document(
    document: dict[str, Any], by_id: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    registry_input = require_exact_fields(
        document["input"],
        {"manifestFixtureIds", "targetCoreApiVersion", "negativeCases"},
        "input",
        "manifest_field_required",
    )
    fixture_ids = registry_input["manifestFixtureIds"]
    if not isinstance(fixture_ids, list) or not fixture_ids:
        raise ContractFailure("manifest_field_required", "input.manifestFixtureIds")
    selected = []
    seen: set[str] = set()
    for index, fixture_id in enumerate(fixture_ids):
        if (
            not isinstance(fixture_id, str)
            or fixture_id in seen
            or fixture_id not in by_id
            or by_id[fixture_id].get("kind") != "plugin-manifest"
        ):
            raise ContractFailure(
                "manifest_field_required", f"input.manifestFixtureIds[{index}]"
            )
        seen.add(fixture_id)
        selected.append(by_id[fixture_id])
    if not isinstance(registry_input["negativeCases"], list):
        raise ContractFailure("manifest_field_required", "input.negativeCases")
    return compile_registry(selected, registry_input["targetCoreApiVersion"])


def validate_domain(value: Any, prefix: str = "") -> None:
    if not isinstance(value, dict):
        raise ContractFailure("domain_ref_invalid", f"{prefix}domain")
    expected = {"contractVersion", "domain", "id"}
    missing = sorted(expected - set(value))
    if missing:
        raise ContractFailure("domain_ref_invalid", f"{prefix}{missing[0]}")
    extra = sorted(set(value) - expected)
    if extra:
        raise ContractFailure("resource_ref_invalid", f"{prefix}{extra[0]}")
    if value["contractVersion"] != VERSION:
        raise ContractFailure("domain_ref_invalid", f"{prefix}contractVersion")
    domain = value["domain"]
    if not isinstance(domain, str) or domain not in DOMAINS:
        raise ContractFailure("domain_ref_invalid", f"{prefix}domain")
    require_ascii_identifier(value["id"], "domain_ref_invalid", f"{prefix}id")


def validate_resource(value: Any) -> None:
    if not isinstance(value, dict):
        raise ContractFailure("resource_ref_invalid", "resource")
    expected = {"contractVersion", "resource", "revision"}
    missing = sorted(expected - set(value))
    extra = sorted(set(value) - expected)
    if missing or extra:
        raise ContractFailure("resource_ref_invalid", (extra or missing)[0])
    if value["contractVersion"] != VERSION:
        raise ContractFailure("resource_ref_invalid", "contractVersion")
    validate_domain(value["resource"], "resource.")
    revision = value["revision"]
    if revision is None:
        return
    if not isinstance(revision, dict) or set(revision) != {"kind", "value"}:
        raise ContractFailure("resource_ref_invalid", "revision")
    kind = revision["kind"]
    revision_value = revision["value"]
    if not isinstance(revision_value, str):
        raise ContractFailure("resource_ref_invalid", "revision.value")
    if kind == "number" and re.fullmatch(r"0|[1-9]\d*", revision_value):
        return
    if kind == "sha256" and SHA256.fullmatch(revision_value):
        return
    raise ContractFailure("resource_ref_invalid", "revision.value")


def validate_principal(value: Any, path: str) -> dict[str, Any]:
    principal = require_exact_fields(
        value,
        {"contractVersion", "pluginId", "pluginVersion", "generation"},
        path,
        "permission_denied",
    )
    if principal["contractVersion"] != VERSION:
        raise ContractFailure("permission_denied", f"{path}.contractVersion")
    if not isinstance(principal["pluginId"], str) or not PLUGIN_ID.fullmatch(principal["pluginId"]):
        raise ContractFailure("permission_denied", f"{path}.pluginId")
    if not isinstance(principal["pluginVersion"], str) or not SEMVER.fullmatch(principal["pluginVersion"]):
        raise ContractFailure("permission_denied", f"{path}.pluginVersion")
    if not is_integer(principal["generation"]) or principal["generation"] < 1:
        raise ContractFailure("plugin_instance_stale", f"{path}.generation")
    return principal


def validate_authority_binding(value: Any) -> dict[str, Any]:
    binding = require_exact_fields(
        value,
        {"bindingFixtureId", "live", "activeGeneration", "principal", "grants"},
        "binding",
        "permission_denied",
    )
    require_ascii_identifier(
        binding["bindingFixtureId"], "permission_denied", "binding.bindingFixtureId"
    )
    if not isinstance(binding["live"], bool):
        raise ContractFailure("permission_denied", "binding.live")
    if not is_integer(binding["activeGeneration"]) or binding["activeGeneration"] < 1:
        raise ContractFailure("plugin_instance_stale", "binding.activeGeneration")
    if not isinstance(binding["grants"], list):
        raise ContractFailure("permission_denied", "binding.grants")
    principal = validate_principal(binding["principal"], "principal")
    seen_grant_ids: set[str] = set()
    for index, grant_value in enumerate(binding["grants"]):
        grant = require_exact_fields(
            grant_value,
            {
                "contractVersion", "grantId", "principal", "operation", "resourceScope",
                "limits", "consent", "grantApprovalEvidenceId", "redaction", "revocation",
            },
            f"grants[{index}]",
            "permission_denied",
        )
        if grant["contractVersion"] != VERSION:
            raise ContractFailure("permission_denied", f"grants[{index}].contractVersion")
        grant_id = require_ascii_identifier(
            grant["grantId"], "permission_denied", f"grants[{index}].grantId"
        )
        if grant_id in seen_grant_ids:
            raise ContractFailure("permission_denied", f"grants[{index}].grantId")
        seen_grant_ids.add(grant_id)
        grant_principal = validate_principal(grant["principal"], f"grants[{index}].principal")
        if grant_principal != principal:
            raise ContractFailure("permission_denied", f"grants[{index}].principal")
        operation = grant["operation"]
        if not is_valid_operation(operation):
            raise ContractFailure("permission_denied", f"grants[{index}].operation")
        scope = require_exact_fields(
            grant["resourceScope"],
            {"resources"},
            f"grants[{index}].resourceScope",
            "permission_denied",
        )
        if not isinstance(scope["resources"], list):
            raise ContractFailure("permission_denied", f"grants[{index}].resourceScope.resources")
        for resource_index, resource in enumerate(scope["resources"]):
            try:
                validate_resource(resource)
            except ContractFailure as failure:
                raise ContractFailure(
                    "permission_denied",
                    f"grants[{index}].resourceScope.resources[{resource_index}].{failure.path}",
                ) from failure
        limits = require_exact_fields(
            grant["limits"],
            {"maxUnitsPerRequest", "maxUnitsPerWindow"},
            f"grants[{index}].limits",
            "permission_denied",
        )
        for field in ("maxUnitsPerRequest", "maxUnitsPerWindow"):
            if not is_integer(limits[field]) or limits[field] < 1:
                raise ContractFailure("permission_denied", f"grants[{index}].limits.{field}")
        if not isinstance(grant["consent"], str) or grant["consent"] not in {
            "activation", "per-use", "approved-schedule",
        }:
            raise ContractFailure("permission_denied", f"grants[{index}].consent")
        require_ascii_identifier(
            grant["grantApprovalEvidenceId"],
            "permission_denied",
            f"grants[{index}].grantApprovalEvidenceId",
        )
        if not isinstance(grant["redaction"], str) or grant["redaction"] not in {
            "metadata-only", "content-summary",
        }:
            raise ContractFailure("permission_denied", f"grants[{index}].redaction")
        if not isinstance(grant["revocation"], str) or grant["revocation"] not in {
            "cancel", "drain-read-only", "reject-result",
        }:
            raise ContractFailure("permission_denied", f"grants[{index}].revocation")
    return binding


def validate_admission_ledger(value: Any) -> dict[str, Any]:
    ledger = require_exact_fields(
        value,
        {"ledgerFixtureId", "quotaWindows"},
        "ledger",
        "permission_denied",
    )
    require_ascii_identifier(
        ledger["ledgerFixtureId"], "permission_denied", "ledger.ledgerFixtureId"
    )
    if not isinstance(ledger["quotaWindows"], list):
        raise ContractFailure("permission_denied", "ledger.quotaWindows")
    seen_window_keys: set[tuple[str, int, int]] = set()
    seen_reservation_ids: set[str] = set()
    for index, window_value in enumerate(ledger["quotaWindows"]):
        window = require_exact_fields(
            window_value,
            {
                "grantId", "generation", "windowStartMs", "committedUnits",
                "reservations",
            },
            f"ledger.quotaWindows[{index}]",
            "permission_denied",
        )
        grant_id = require_ascii_identifier(
            window["grantId"],
            "permission_denied",
            f"ledger.quotaWindows[{index}].grantId",
        )
        for field in ("generation", "windowStartMs", "committedUnits"):
            if not is_integer(window[field]) or window[field] < 0:
                raise ContractFailure(
                    "permission_denied", f"ledger.quotaWindows[{index}].{field}"
                )
        if window["generation"] < 1 or window["windowStartMs"] % QUOTA_WINDOW_MS != 0:
            raise ContractFailure(
                "permission_denied", f"ledger.quotaWindows[{index}].windowStartMs"
            )
        key = (grant_id, window["generation"], window["windowStartMs"])
        if key in seen_window_keys:
            raise ContractFailure("permission_denied", f"ledger.quotaWindows[{index}]")
        seen_window_keys.add(key)
        if not isinstance(window["reservations"], list):
            raise ContractFailure(
                "permission_denied", f"ledger.quotaWindows[{index}].reservations"
            )
        for reservation_index, reservation_value in enumerate(window["reservations"]):
            reservation = require_exact_fields(
                reservation_value,
                {"reservationId", "units"},
                f"ledger.quotaWindows[{index}].reservations[{reservation_index}]",
                "permission_denied",
            )
            reservation_id = require_ascii_identifier(
                reservation["reservationId"],
                "permission_denied",
                f"ledger.quotaWindows[{index}].reservations[{reservation_index}].reservationId",
            )
            if reservation_id in seen_reservation_ids:
                raise ContractFailure(
                    "permission_denied",
                    f"ledger.quotaWindows[{index}].reservations[{reservation_index}].reservationId",
                )
            seen_reservation_ids.add(reservation_id)
            if not is_integer(reservation["units"]) or reservation["units"] < 1:
                raise ContractFailure(
                    "permission_denied",
                    f"ledger.quotaWindows[{index}].reservations[{reservation_index}].units",
                )
    return ledger


def validate_consent_evidence(value: Any) -> dict[str, Any]:
    evidence = require_exact_fields(
        value,
        {
            "evidenceId", "kind", "bindingFixtureId", "grantId", "validFromMs",
            "validUntilMs", "resource", "units", "consumedAtMs", "scheduleExecutionId",
        },
        "consentEvidence",
        "permission_denied",
    )
    for field in ("evidenceId", "bindingFixtureId", "grantId"):
        require_ascii_identifier(
            evidence[field], "permission_denied", f"consentEvidence.{field}"
        )
    if evidence["kind"] not in {"grant-approval", "per-use", "approved-schedule"}:
        raise ContractFailure("permission_denied", "consentEvidence.kind")
    if not is_integer(evidence["validFromMs"]) or evidence["validFromMs"] < 0:
        raise ContractFailure("permission_denied", "consentEvidence.validFromMs")
    valid_until = evidence["validUntilMs"]
    if valid_until is not None and (
        not is_integer(valid_until) or valid_until <= evidence["validFromMs"]
    ):
        raise ContractFailure("permission_denied", "consentEvidence.validUntilMs")
    consumed_at = evidence["consumedAtMs"]
    if consumed_at is not None and (not is_integer(consumed_at) or consumed_at < 0):
        raise ContractFailure("permission_denied", "consentEvidence.consumedAtMs")
    if evidence["kind"] == "grant-approval":
        if any(
            evidence[field] is not None
            for field in ("resource", "units", "consumedAtMs", "scheduleExecutionId")
        ):
            raise ContractFailure("permission_denied", "consentEvidence")
    else:
        validate_resource(evidence["resource"])
        if not is_integer(evidence["units"]) or evidence["units"] < 1:
            raise ContractFailure("permission_denied", "consentEvidence.units")
        schedule_id = evidence["scheduleExecutionId"]
        if evidence["kind"] == "approved-schedule":
            require_nonempty_string(
                schedule_id, "permission_denied", "consentEvidence.scheduleExecutionId"
            )
        elif schedule_id is not None:
            raise ContractFailure("permission_denied", "consentEvidence.scheduleExecutionId")
    return evidence


def authority_results(document: dict[str, Any]) -> list[dict[str, Any]]:
    authority_input = require_exact_fields(
        document["input"],
        {
            "quotaWindowDurationMs", "bindingFixtures", "admissionLedgerFixtures",
            "consentEvidenceFixtures", "cases", "invalidBindings", "invalidRequests",
        },
        "input",
        "permission_denied",
    )
    if authority_input["quotaWindowDurationMs"] != QUOTA_WINDOW_MS:
        raise ContractFailure("permission_denied", "input.quotaWindowDurationMs")

    bindings: dict[str, dict[str, Any]] = {}
    for binding_value in authority_input["bindingFixtures"]:
        binding = validate_authority_binding(binding_value)
        binding_id = binding["bindingFixtureId"]
        if binding_id in bindings:
            raise ContractFailure("permission_denied", "binding.bindingFixtureId")
        bindings[binding_id] = binding

    ledgers: dict[str, dict[str, Any]] = {}
    for ledger_value in authority_input["admissionLedgerFixtures"]:
        ledger = validate_admission_ledger(ledger_value)
        ledger_id = ledger["ledgerFixtureId"]
        if ledger_id in ledgers:
            raise ContractFailure("permission_denied", "ledger.ledgerFixtureId")
        ledgers[ledger_id] = ledger

    evidence_by_id: dict[str, dict[str, Any]] = {}
    for evidence_value in authority_input["consentEvidenceFixtures"]:
        evidence = validate_consent_evidence(evidence_value)
        evidence_id = evidence["evidenceId"]
        if evidence_id in evidence_by_id:
            raise ContractFailure("permission_denied", "consentEvidence.evidenceId")
        binding = bindings.get(evidence["bindingFixtureId"])
        grant_ids = {grant["grantId"] for grant in binding["grants"]} if binding else set()
        if evidence["grantId"] not in grant_ids:
            raise ContractFailure("permission_denied", "consentEvidence.grantId")
        evidence_by_id[evidence_id] = evidence

    def evidence_is_live(evidence: dict[str, Any], admission_at: int) -> bool:
        return (
            evidence["validFromMs"] <= admission_at
            and (evidence["validUntilMs"] is None or admission_at < evidence["validUntilMs"])
            and evidence["consumedAtMs"] is None
        )

    results = []
    for index, case_value in enumerate(authority_input["cases"]):
        case = require_exact_fields(
            case_value,
            {
                "caseId", "bindingFixtureId", "callerPluginId",
                "manifestRequestedOperations", "hostContext", "request",
            },
            f"cases[{index}]",
            "permission_denied",
        )
        case_id = require_nonempty_string(
            case["caseId"], "permission_denied", f"cases[{index}].caseId"
        )
        base = {"caseId": case_id}
        denied_base = {
            **base,
            "allowed": False,
            "reservationCreated": False,
            "underlyingDispatch": False,
        }
        binding_id = case["bindingFixtureId"]
        if binding_id is not None and not isinstance(binding_id, str):
            raise ContractFailure("permission_denied", f"cases[{index}].bindingFixtureId")
        require_nonempty_string(
            case["callerPluginId"], "permission_denied", f"cases[{index}].callerPluginId"
        )
        requested = case["manifestRequestedOperations"]
        if not isinstance(requested, list) or any(
            not is_valid_operation(item) for item in requested
        ):
            raise ContractFailure(
                "permission_denied", f"cases[{index}].manifestRequestedOperations"
            )
        host_context = require_exact_fields(
            case["hostContext"],
            {
                "ledgerFixtureId", "admissionAtMs", "consentEvidenceId",
                "scheduleExecutionId",
            },
            f"cases[{index}].hostContext",
            "permission_denied",
        )
        ledger_id = require_nonempty_string(
            host_context["ledgerFixtureId"],
            "permission_denied",
            f"cases[{index}].hostContext.ledgerFixtureId",
        )
        if ledger_id not in ledgers:
            raise ContractFailure(
                "permission_denied", f"cases[{index}].hostContext.ledgerFixtureId"
            )
        admission_at = host_context["admissionAtMs"]
        if not is_integer(admission_at) or admission_at < 0:
            raise ContractFailure(
                "permission_denied", f"cases[{index}].hostContext.admissionAtMs"
            )
        for field in ("consentEvidenceId", "scheduleExecutionId"):
            if host_context[field] is not None and not isinstance(host_context[field], str):
                raise ContractFailure(
                    "permission_denied", f"cases[{index}].hostContext.{field}"
                )

        request = require_exact_fields(
            case["request"],
            {"operation", "resource", "units"},
            f"cases[{index}].request",
            "permission_denied",
        )
        operation = request["operation"]
        if not is_valid_operation(operation):
            raise ContractFailure("permission_denied", f"cases[{index}].request.operation")
        validate_resource(request["resource"])
        if not is_integer(request["units"]) or request["units"] < 1:
            raise ContractFailure("permission_denied", f"cases[{index}].request.units")

        binding = bindings.get(binding_id) if binding_id is not None else None
        if binding is None:
            results.append({**denied_base, "errorCode": "plugin_instance_missing"})
            continue
        principal = binding["principal"]
        if not binding["live"] or principal["generation"] != binding["activeGeneration"]:
            results.append({**denied_base, "errorCode": "plugin_instance_stale"})
            continue
        operation_grants = [
            grant for grant in binding["grants"] if grant["operation"] == operation
        ]
        if not operation_grants:
            results.append({**denied_base, "errorCode": "permission_denied"})
            continue
        scoped_grants = [
            grant
            for grant in operation_grants
            if request["resource"] in grant["resourceScope"]["resources"]
        ]
        if not scoped_grants:
            results.append({**denied_base, "errorCode": "scope_not_approved"})
            continue
        grant = scoped_grants[0]
        if request["units"] > grant["limits"]["maxUnitsPerRequest"]:
            results.append({**denied_base, "errorCode": "operation_limit_exceeded"})
            continue

        approval = evidence_by_id.get(grant["grantApprovalEvidenceId"])
        if not (
            approval
            and approval["kind"] == "grant-approval"
            and approval["bindingFixtureId"] == binding_id
            and approval["grantId"] == grant["grantId"]
            and evidence_is_live(approval, admission_at)
        ):
            results.append({**denied_base, "errorCode": "permission_denied"})
            continue

        consent_evidence_id = host_context["consentEvidenceId"]
        schedule_execution_id = host_context["scheduleExecutionId"]
        if grant["consent"] == "activation":
            consent_valid = consent_evidence_id is None and schedule_execution_id is None
        else:
            consent_evidence = (
                evidence_by_id.get(consent_evidence_id)
                if isinstance(consent_evidence_id, str)
                else None
            )
            expected_kind = grant["consent"]
            consent_valid = bool(
                consent_evidence
                and consent_evidence["kind"] == expected_kind
                and consent_evidence["bindingFixtureId"] == binding_id
                and consent_evidence["grantId"] == grant["grantId"]
                and consent_evidence["resource"] == request["resource"]
                and consent_evidence["units"] == request["units"]
                and evidence_is_live(consent_evidence, admission_at)
            )
            if expected_kind == "per-use":
                consent_valid = consent_valid and schedule_execution_id is None
            else:
                consent_valid = consent_valid and bool(
                    schedule_execution_id
                    and consent_evidence
                    and consent_evidence["scheduleExecutionId"] == schedule_execution_id
                )
        if not consent_valid:
            results.append({**denied_base, "errorCode": "permission_denied"})
            continue

        window_start = (admission_at // QUOTA_WINDOW_MS) * QUOTA_WINDOW_MS
        current_windows = [
            window
            for window in ledgers[ledger_id]["quotaWindows"]
            if window["grantId"] == grant["grantId"]
            and window["generation"] == principal["generation"]
            and window["windowStartMs"] == window_start
        ]
        if current_windows:
            window = current_windows[0]
            accounted_units = window["committedUnits"] + sum(
                reservation["units"] for reservation in window["reservations"]
            )
        else:
            accounted_units = 0
        after_reservation = accounted_units + request["units"]
        if after_reservation > grant["limits"]["maxUnitsPerWindow"]:
            results.append({**denied_base, "errorCode": "operation_limit_exceeded"})
            continue
        results.append({
            **base,
            "allowed": True,
            "reservationCreated": True,
            "windowUnitsAfterReservation": after_reservation,
            "underlyingDispatch": True,
        })
    return results


def validate_job(case: dict[str, Any]) -> dict[str, Any]:
    case_value = require_exact_fields(
        case, {"caseId", "record", "events"}, "case", "job_record_invalid"
    )
    case_id = require_nonempty_string(case_value["caseId"], "job_record_invalid", "case.caseId")
    record = require_exact_fields(
        case_value["record"],
        {
            "contractVersion", "id", "owner", "kind", "trigger", "state", "progress",
            "executionCorrelationId", "cancellation", "terminal", "createdAt", "startedAt",
            "updatedAt", "finishedAt",
        },
        "record",
        "job_record_invalid",
    )
    events_value = case_value["events"]
    if record["contractVersion"] != VERSION:
        raise ContractFailure("job_record_invalid", "record.contractVersion")
    job_id = require_nonempty_string(record["id"], "job_record_invalid", "record.id")
    require_nonempty_string(record["kind"], "job_record_invalid", "record.kind")
    require_nonempty_string(
        record["executionCorrelationId"],
        "job_record_invalid",
        "record.executionCorrelationId",
    )

    if not isinstance(record["owner"], dict):
        raise ContractFailure("job_record_invalid", "record.owner")
    owner = record["owner"]
    if owner.get("kind") == "plugin":
        extra = sorted(set(owner) - {"kind", "pluginId", "pluginVersion", "generation"})
        if extra:
            raise ContractFailure("job_record_invalid", f"record.owner.{extra[0]}")
        if "generation" not in owner or not is_integer(owner["generation"]) or owner["generation"] < 1:
            raise ContractFailure("job_owner_generation_required", "record.owner.generation")
        require_exact_fields(
            owner,
            {"kind", "pluginId", "pluginVersion", "generation"},
            "record.owner",
            "job_record_invalid",
        )
        if not isinstance(owner["pluginId"], str) or not PLUGIN_ID.fullmatch(owner["pluginId"]):
            raise ContractFailure("job_record_invalid", "record.owner.pluginId")
        if not isinstance(owner["pluginVersion"], str) or not SEMVER.fullmatch(owner["pluginVersion"]):
            raise ContractFailure("job_record_invalid", "record.owner.pluginVersion")
    elif owner.get("kind") == "core":
        require_exact_fields(owner, {"kind", "component"}, "record.owner", "job_record_invalid")
        require_nonempty_string(owner["component"], "job_record_invalid", "record.owner.component")
    else:
        raise ContractFailure("job_record_invalid", "record.owner.kind")

    trigger = require_exact_fields(
        record["trigger"], {"kind", "id"}, "record.trigger", "job_record_invalid"
    )
    require_nonempty_string(trigger["kind"], "job_record_invalid", "record.trigger.kind")
    require_nonempty_string(trigger["id"], "job_record_invalid", "record.trigger.id")
    progress = require_exact_fields(
        record["progress"], {"current", "total"}, "record.progress", "job_record_invalid"
    )
    if (
        not is_integer(progress["current"])
        or not is_integer(progress["total"])
        or progress["current"] < 0
        or progress["total"] < progress["current"]
    ):
        raise ContractFailure("job_record_invalid", "record.progress")
    cancellation = require_exact_fields(
        record["cancellation"],
        {"requested", "requestedAt", "reason"},
        "record.cancellation",
        "job_cancellation_invalid",
    )
    if not isinstance(cancellation["requested"], bool):
        raise ContractFailure("job_cancellation_invalid", "record.cancellation.requested")
    if record["state"] not in JOB_STATES:
        raise ContractFailure("job_state_invalid", "record.state")
    if not isinstance(events_value, list) or not events_value:
        raise ContractFailure("job_event_invalid", "events")

    for field in ("createdAt", "updatedAt"):
        if not is_integer(record[field]) or record[field] < 0:
            raise ContractFailure("job_timestamp_invalid", f"record.{field}")
    for field in ("startedAt", "finishedAt"):
        value = record[field]
        if value is not None and (not is_integer(value) or value < 0):
            raise ContractFailure("job_timestamp_invalid", f"record.{field}")
    if record["startedAt"] is not None and record["createdAt"] > record["startedAt"]:
        raise ContractFailure("job_timestamp_invalid", "record.createdAt")
    if record["finishedAt"] is not None:
        lower = record["startedAt"] if record["startedAt"] is not None else record["createdAt"]
        if lower > record["finishedAt"]:
            raise ContractFailure("job_timestamp_invalid", "record.finishedAt")
    if record["createdAt"] > record["updatedAt"]:
        raise ContractFailure("job_timestamp_invalid", "record.updatedAt")

    events: list[dict[str, Any]] = []
    previous_seq = 0
    previous_at: int | None = None
    latest_progress: dict[str, Any] | None = None
    expected_state_by_kind = {
        "queued": "queued",
        "started": "running",
        "progress": "running",
        "cancellation_requested": "cancelling",
        "terminal": "terminal",
    }
    event_data_fields = {
        "queued": set(),
        "started": set(),
        "progress": {"current", "total"},
        "cancellation_requested": {"reason"},
        "terminal": {"outcome"},
    }
    for index, event_value in enumerate(events_value):
        event = require_exact_fields(
            event_value,
            {"contractVersion", "jobId", "seq", "at", "kind", "state", "data"},
            f"events[{index}]",
            "job_event_invalid",
        )
        if event["contractVersion"] != VERSION:
            raise ContractFailure("job_event_invalid", f"events[{index}].contractVersion")
        if event["jobId"] != job_id:
            raise ContractFailure("job_event_job_mismatch", f"events[{index}].jobId")
        if not is_integer(event["seq"]) or event["seq"] <= previous_seq:
            raise ContractFailure("job_event_sequence_invalid", f"events[{index}].seq")
        if (
            not is_integer(event["at"])
            or event["at"] < 0
            or (previous_at is not None and event["at"] < previous_at)
        ):
            raise ContractFailure("job_timestamp_invalid", f"events[{index}].at")
        kind = event["kind"]
        if not isinstance(kind, str) or kind not in expected_state_by_kind:
            raise ContractFailure("job_event_invalid", f"events[{index}].kind")
        if event["state"] != expected_state_by_kind[kind]:
            raise ContractFailure("job_state_invalid", f"events[{index}].state")
        data = require_exact_fields(
            event["data"], event_data_fields[kind], f"events[{index}].data", "job_event_invalid"
        )
        if kind == "progress":
            if (
                not is_integer(data["current"])
                or not is_integer(data["total"])
                or data["current"] < 0
                or data["total"] < data["current"]
            ):
                raise ContractFailure("job_event_invalid", f"events[{index}].data")
            if latest_progress is not None:
                if data["current"] < latest_progress["current"]:
                    raise ContractFailure(
                        "job_event_invalid", f"events[{index}].data.current"
                    )
                if data["total"] < latest_progress["total"]:
                    raise ContractFailure(
                        "job_event_invalid", f"events[{index}].data.total"
                    )
            latest_progress = data
        elif kind == "cancellation_requested":
            require_nonempty_string(
                data["reason"], "job_cancellation_invalid", f"events[{index}].data.reason"
            )
        elif kind == "terminal":
            if not isinstance(data["outcome"], str) or data["outcome"] not in TERMINALS:
                raise ContractFailure("job_terminal_invalid", f"events[{index}].data.outcome")
        events.append(event)
        previous_seq = event["seq"]
        previous_at = event["at"]

    if latest_progress is None:
        if progress["current"] != 0:
            raise ContractFailure("job_record_invalid", "record.progress.current")
    else:
        for field in ("current", "total"):
            if progress[field] != latest_progress[field]:
                raise ContractFailure("job_record_invalid", f"record.progress.{field}")

    terminal_indexes = [index for index, event in enumerate(events) if event["kind"] == "terminal"]
    if len(terminal_indexes) > 1:
        raise ContractFailure("job_terminal_duplicate", f"events[{terminal_indexes[1]}]")
    terminal_index = terminal_indexes[0] if terminal_indexes else None
    if terminal_index is not None and terminal_index != len(events) - 1:
        raise ContractFailure("job_event_after_terminal", f"events[{terminal_index + 1}]")

    cancel_indexes = [
        index for index, event in enumerate(events) if event["kind"] == "cancellation_requested"
    ]
    if len(cancel_indexes) > 1 or cancellation["requested"] != (len(cancel_indexes) == 1):
        raise ContractFailure("job_cancellation_invalid", "record.cancellation")
    if cancellation["requested"]:
        cancel_event = events[cancel_indexes[0]]
        if (
            not is_integer(cancellation["requestedAt"])
            or cancellation["requestedAt"] < 0
            or cancellation["requestedAt"] != cancel_event["at"]
            or cancellation["reason"] != cancel_event["data"]["reason"]
        ):
            raise ContractFailure("job_cancellation_invalid", "record.cancellation")
    elif cancellation["requestedAt"] is not None or cancellation["reason"] is not None:
        raise ContractFailure("job_cancellation_invalid", "record.cancellation")

    if events[0]["kind"] != "queued":
        raise ContractFailure("job_state_transition_invalid", "events[0].kind")
    replay_state = "queued"
    started_event: dict[str, Any] | None = None
    for index, event in enumerate(events[1:], 1):
        kind = event["kind"]
        if kind == "started":
            if replay_state != "queued" or started_event is not None:
                raise ContractFailure("job_state_transition_invalid", f"events[{index}].kind")
            replay_state = "running"
            started_event = event
        elif kind == "progress":
            if replay_state != "running":
                raise ContractFailure("job_state_transition_invalid", f"events[{index}].kind")
        elif kind == "cancellation_requested":
            if replay_state not in {"queued", "running"}:
                raise ContractFailure("job_state_transition_invalid", f"events[{index}].kind")
            replay_state = "cancelling"
        elif kind == "terminal":
            outcome = event["data"]["outcome"]
            if outcome == "cancelled" and not cancellation["requested"]:
                raise ContractFailure("job_cancellation_invalid", "record.cancellation")
            allowed_from = {
                "succeeded": {"running"},
                "failed": {"running"},
                "cancelled": {"cancelling"},
                "interrupted": {"queued", "running", "cancelling"},
            }[outcome]
            if replay_state not in allowed_from:
                raise ContractFailure("job_state_transition_invalid", f"events[{index}].kind")
            replay_state = "terminal"
        else:
            raise ContractFailure("job_state_transition_invalid", f"events[{index}].kind")

    if record["state"] == "terminal" and terminal_index is None:
        raise ContractFailure("job_terminal_invalid", "events")
    if events[0]["at"] != record["createdAt"]:
        raise ContractFailure("job_timestamp_invalid", "record.createdAt")
    if events[-1]["at"] != record["updatedAt"]:
        raise ContractFailure("job_timestamp_invalid", "record.updatedAt")
    if started_event is None:
        if record["startedAt"] is not None:
            raise ContractFailure("job_timestamp_invalid", "record.startedAt")
    elif record["startedAt"] != started_event["at"]:
        raise ContractFailure("job_timestamp_invalid", "record.startedAt")

    if record["state"] != "terminal":
        if terminal_index is not None or record["state"] != replay_state:
            raise ContractFailure("job_state_invalid", "record.state")
        if record["terminal"] is not None:
            raise ContractFailure("job_terminal_invalid", "record.terminal")
        if record["finishedAt"] is not None:
            raise ContractFailure("job_terminal_invalid", "record.finishedAt")
        record_outcome = None
    else:
        if replay_state != "terminal" or terminal_index is None:
            raise ContractFailure("job_terminal_invalid", "events")
        terminal = require_exact_fields(
            record["terminal"],
            {"outcome", "resultSummary", "error"},
            "record.terminal",
            "job_terminal_invalid",
        )
        record_outcome = terminal["outcome"]
        event_outcome = events[terminal_index]["data"]["outcome"]
        if not isinstance(record_outcome, str) or record_outcome not in TERMINALS or event_outcome != record_outcome:
            raise ContractFailure("job_terminal_invalid", "record.terminal.outcome")
        if terminal["resultSummary"] is not None and not isinstance(terminal["resultSummary"], dict):
            raise ContractFailure("job_terminal_invalid", "record.terminal.resultSummary")
        if terminal["error"] is not None:
            terminal_error = require_exact_fields(
                terminal["error"],
                {"code", "message"},
                "record.terminal.error",
                "job_terminal_invalid",
            )
            require_nonempty_string(
                terminal_error["code"], "job_terminal_invalid", "record.terminal.error.code"
            )
            require_nonempty_string(
                terminal_error["message"], "job_terminal_invalid", "record.terminal.error.message"
            )
        if record["finishedAt"] != events[terminal_index]["at"]:
            raise ContractFailure("job_terminal_invalid", "record.finishedAt")

    return {
        "caseId": case_id,
        "valid": True,
        "terminalOutcome": record_outcome,
        "lastSeq": previous_seq,
    }


def validate_startup(document: dict[str, Any]) -> None:
    input_value = require_exact_fields(
        document["input"],
        {"idleWindowMs", "readiness", "observers", "scenarios", "positiveControls", "negativeCases"},
        "input",
        "startup_scenario_invalid",
    )
    expected = require_exact_fields(
        document["expected"],
        {
            "scenarios", "positiveControlEvidence", "zeroCountFailureCode",
            "observerFailureCode", "negativeCases",
        },
        "expected",
        "startup_scenario_invalid",
    )
    if not is_integer(input_value["idleWindowMs"]) or input_value["idleWindowMs"] != 30000:
        raise ContractFailure("startup_phase_invalid", "input.idleWindowMs")
    if input_value["readiness"] != STARTUP_READINESS:
        raise ContractFailure("startup_readiness_invalid", "input.readiness")
    if input_value["observers"] != STARTUP_OBSERVERS:
        raise ContractFailure("network_observer_invalid", "input.observers")

    required_scenarios = {
        "core-only-cold-boot-and-idle": ([], []),
        "updates-included-disabled-cold-boot-and-idle": (["updates"], []),
    }
    if not isinstance(input_value["scenarios"], list):
        raise ContractFailure("startup_scenario_invalid", "input.scenarios")
    scenarios: dict[str, dict[str, Any]] = {}
    for index, scenario_value in enumerate(input_value["scenarios"]):
        scenario = require_exact_fields(
            scenario_value,
            {"scenarioId", "includedPlugins", "enabledPlugins", "phases"},
            f"input.scenarios[{index}]",
            "startup_scenario_invalid",
        )
        scenario_id = scenario["scenarioId"]
        if (
            not isinstance(scenario_id, str)
            or scenario_id in scenarios
            or scenario_id not in required_scenarios
        ):
            raise ContractFailure("startup_scenario_invalid", f"input.scenarios[{index}].scenarioId")
        if scenario["phases"] != STARTUP_PHASES:
            raise ContractFailure("startup_phase_invalid", f"input.scenarios[{index}].phases")
        if (scenario["includedPlugins"], scenario["enabledPlugins"]) != required_scenarios[scenario_id]:
            raise ContractFailure("startup_scenario_invalid", f"input.scenarios[{index}]")
        scenarios[scenario_id] = scenario
    if set(scenarios) != set(required_scenarios):
        raise ContractFailure("startup_scenario_invalid", "input.scenarios")

    if not isinstance(expected["scenarios"], list):
        raise ContractFailure("startup_scenario_invalid", "expected.scenarios")
    expected_scenarios: dict[str, dict[str, Any]] = {}
    for index, scenario_value in enumerate(expected["scenarios"]):
        scenario = require_exact_fields(
            scenario_value,
            {
                "scenarioId", "attemptedEgressCount", "networkCapableTimerCount",
                "readinessReached", "observedPhases", "observerCoverage",
            },
            f"expected.scenarios[{index}]",
            "startup_scenario_invalid",
        )
        scenario_id = scenario["scenarioId"]
        if not isinstance(scenario_id, str) or scenario_id in expected_scenarios:
            raise ContractFailure("startup_scenario_invalid", f"expected.scenarios[{index}].scenarioId")
        if scenario["readinessReached"] != STARTUP_READINESS:
            raise ContractFailure("startup_readiness_invalid", f"expected.scenarios[{index}].readinessReached")
        if scenario["observedPhases"] != STARTUP_PHASES:
            raise ContractFailure("startup_phase_invalid", f"expected.scenarios[{index}].observedPhases")
        if scenario["observerCoverage"] != STARTUP_OBSERVERS:
            raise ContractFailure("network_observer_invalid", f"expected.scenarios[{index}].observerCoverage")
        for field in ("attemptedEgressCount", "networkCapableTimerCount"):
            if not is_integer(scenario[field]) or scenario[field] != 0:
                raise ContractFailure("zero_network_startup_failed", f"expected.scenarios[{index}]")
        expected_scenarios[scenario_id] = scenario
    if set(expected_scenarios) != set(scenarios):
        raise ContractFailure("startup_scenario_invalid", "expected.scenarios")

    if not isinstance(input_value["positiveControls"], list):
        raise ContractFailure("network_observer_invalid", "input.positiveControls")
    controls_by_id: dict[str, dict[str, Any]] = {}
    control_id_by_observer: dict[str, str] = {}
    for index, control_value in enumerate(input_value["positiveControls"]):
        control = require_exact_fields(
            control_value,
            {"controlId", "observer", "phase", "minimumCount"},
            f"input.positiveControls[{index}]",
            "network_observer_invalid",
        )
        control_id = require_nonempty_string(
            control["controlId"],
            "network_observer_invalid",
            f"input.positiveControls[{index}].controlId",
        )
        observer = control["observer"]
        if control_id in controls_by_id:
            raise ContractFailure(
                "network_observer_invalid",
                f"input.positiveControls[{index}].controlId",
            )
        if not isinstance(observer, str) or observer not in STARTUP_OBSERVERS:
            raise ContractFailure(
                "network_observer_invalid",
                f"input.positiveControls[{index}].observer",
            )
        if observer in control_id_by_observer:
            raise ContractFailure(
                "network_observer_invalid",
                f"input.positiveControls[{index}].observer",
            )
        if not isinstance(control["phase"], str) or control["phase"] not in STARTUP_PHASES:
            raise ContractFailure(
                "network_observer_invalid",
                f"input.positiveControls[{index}].phase",
            )
        if not is_integer(control["minimumCount"]) or control["minimumCount"] < 1:
            raise ContractFailure(
                "network_observer_invalid",
                f"input.positiveControls[{index}].minimumCount",
            )
        controls_by_id[control_id] = control
        control_id_by_observer[observer] = control_id
    if (
        {control_id: control["observer"] for control_id, control in controls_by_id.items()}
        != STARTUP_CONTROLS
        or set(control_id_by_observer) != set(STARTUP_OBSERVERS)
    ):
        raise ContractFailure("network_observer_invalid", "input.positiveControls")

    evidence_values = expected["positiveControlEvidence"]
    if not isinstance(evidence_values, list):
        raise ContractFailure("network_observer_invalid", "expected.positiveControlEvidence")
    evidence_ids: set[str] = set()
    for index, evidence_value in enumerate(evidence_values):
        evidence = require_exact_fields(
            evidence_value,
            {"controlId", "observer", "phase", "observedCount"},
            f"expected.positiveControlEvidence[{index}]",
            "network_observer_invalid",
        )
        control_id = evidence["controlId"]
        if not isinstance(control_id, str) or control_id not in controls_by_id or control_id in evidence_ids:
            raise ContractFailure(
                "network_observer_invalid",
                f"expected.positiveControlEvidence[{index}].controlId",
            )
        control = controls_by_id[control_id]
        if evidence["observer"] != control["observer"]:
            raise ContractFailure(
                "network_observer_invalid",
                f"expected.positiveControlEvidence[{index}].observer",
            )
        if evidence["phase"] != control["phase"]:
            raise ContractFailure(
                "network_observer_invalid",
                f"expected.positiveControlEvidence[{index}].phase",
            )
        if (
            not is_integer(evidence["observedCount"])
            or evidence["observedCount"] < control["minimumCount"]
        ):
            raise ContractFailure(
                "network_observer_invalid",
                f"expected.positiveControlEvidence[{index}].observedCount",
            )
        evidence_ids.add(control_id)
    if evidence_ids != set(controls_by_id):
        raise ContractFailure("network_observer_invalid", "expected.positiveControlEvidence")

    if expected["zeroCountFailureCode"] != "zero_network_startup_failed":
        raise ContractFailure("startup_scenario_invalid", "expected.zeroCountFailureCode")
    if expected["observerFailureCode"] != "network_observer_invalid":
        raise ContractFailure("network_observer_invalid", "expected.observerFailureCode")


def referenced_error_codes(value: Any) -> set[str]:
    if isinstance(value, dict):
        found = {value["errorCode"]} if isinstance(value.get("errorCode"), str) else set()
        return found | set().union(*(referenced_error_codes(item) for item in value.values()), set())
    if isinstance(value, list):
        return set().union(*(referenced_error_codes(item) for item in value), set())
    return set()


def require_probe_cases(values: list[dict[str, Any]], group: str) -> None:
    actual = {
        value.get("caseId")
        for value in values
        if isinstance(value, dict) and isinstance(value.get("caseId"), str)
    }
    missing = REQUIRED_PROBE_CASES[group] - actual
    assert not missing, f"{group} fixture omitted required adversarial cases: {sorted(missing)}"


def validator_emitted_error_codes() -> set[str]:
    tree = ast.parse(Path(__file__).read_text(encoding="utf-8"))
    code_argument_by_call = {
        "ContractFailure": 0,
        "require_nonempty_string": 1,
        "require_exact_fields": 3,
    }
    emitted: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        argument_index = code_argument_by_call.get(node.func.id)
        if argument_index is None or len(node.args) <= argument_index:
            continue
        argument = node.args[argument_index]
        if (
            isinstance(argument, ast.Constant)
            and isinstance(argument.value, str)
            and ERROR_CODE.fullmatch(argument.value)
        ):
            emitted.add(argument.value)
    return emitted


def validate_error_catalog(catalog: dict[str, Any], referenced: set[str]) -> None:
    catalog_input = catalog["input"]
    catalog_expected = catalog["expected"]
    assert isinstance(catalog_input, dict) and set(catalog_input) == {"errors"}, (
        "error catalog input fields are not closed"
    )
    expected_fields = {
        "unique", "closed", "closedOver", "stableCodePattern", "entryFields",
        "categoryValues", "secretFieldsAllowed",
    }
    assert isinstance(catalog_expected, dict) and set(catalog_expected) == expected_fields, (
        "error catalog expected metadata fields are not closed"
    )
    errors = catalog_input["errors"]
    assert isinstance(errors, list), "error catalog entries must be a list"
    entries_by_code: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(errors):
        assert isinstance(item, dict) and set(item) == {"code", "category", "redacted"}, (
            f"error catalog entry {index} fields were tampered"
        )
        code = item["code"]
        category = item["category"]
        assert isinstance(code, str) and ERROR_CODE.fullmatch(code), (
            f"error catalog entry {index} has invalid code"
        )
        assert code not in entries_by_code, f"duplicate error catalog code: {code}"
        assert isinstance(category, str) and category in ERROR_CATEGORIES, (
            f"error catalog entry {code} has invalid category"
        )
        assert EXPECTED_ERROR_CATEGORY.get(code) == category, (
            f"error catalog category tamper for {code}: {category}"
        )
        assert item["redacted"] is True, f"error catalog redaction tamper for {code}"
        entries_by_code[code] = item

    codes = set(entries_by_code)
    assert codes == set(EXPECTED_ERROR_CATEGORY), (
        "error catalog is not closed; missing/excess codes: "
        f"missing={sorted(set(EXPECTED_ERROR_CATEGORY) - codes)}, "
        f"excess={sorted(codes - set(EXPECTED_ERROR_CATEGORY))}"
    )
    emitted = validator_emitted_error_codes()
    assert emitted <= codes, f"uncatalogued validator error codes: {sorted(emitted - codes)}"
    assert PLAN_STABLE_ERROR_CODES <= codes, (
        f"catalog omitted parent/host stable codes: {sorted(PLAN_STABLE_ERROR_CODES - codes)}"
    )
    assert referenced <= codes, f"uncatalogued expected error codes: {sorted(referenced - codes)}"
    assert codes == emitted | referenced | PLAN_STABLE_ERROR_CODES, (
        "error catalog closedOver metadata does not match validator/fixture/plan coverage; "
        f"unowned={sorted(codes - emitted - referenced - PLAN_STABLE_ERROR_CODES)}"
    )
    assert catalog_expected["unique"] is True
    assert catalog_expected["closed"] is True
    assert catalog_expected["closedOver"] == [
        "validator-emitted", "fixture-expected", "plan-referenced",
    ]
    assert catalog_expected["stableCodePattern"] == ERROR_CODE.pattern
    assert catalog_expected["entryFields"] == ["code", "category", "redacted"]
    assert catalog_expected["categoryValues"] == sorted(ERROR_CATEGORIES)
    assert catalog_expected["secretFieldsAllowed"] == []


def run_catalog_tamper_probes(catalog: dict[str, Any], referenced: set[str]) -> list[str]:
    mutations = {
        "error-catalog-added-code": [
            {
                "op": "add",
                "path": "/input/errors/-",
                "value": {"code": "attacker_added", "category": "authority", "redacted": True},
            }
        ],
        "error-catalog-category-tamper": [
            {"op": "replace", "path": "/input/errors/0/category", "value": "authority"}
        ],
        "error-catalog-redaction-tamper": [
            {"op": "replace", "path": "/input/errors/0/redacted", "value": False}
        ],
        "error-catalog-closure-metadata-tamper": [
            {"op": "replace", "path": "/expected/closed", "value": False}
        ],
    }
    rejected: list[str] = []
    for name, patch in mutations.items():
        try:
            validate_error_catalog(apply_patch(catalog, patch), referenced)
        except AssertionError:
            rejected.append(name)
        else:
            raise AssertionError(f"{name}: error catalog tamper was accepted")
    return rejected


def run_json_duplicate_member_probe() -> str:
    raw = '{"outer":{"operation":"storage.read","operation":"storage.write"}}'
    try:
        strict_json_loads(raw)
    except ValueError as error:
        assert "duplicate JSON member" in str(error)
        return "nested-duplicate-json-member"
    raise AssertionError("nested duplicate JSON member probe was accepted")


def run_canonical_json_probes() -> list[str]:
    literal = {"displayName": "Fixture Z Base Café 文献"}
    escaped = strict_json_loads(
        '{"displayName":"Fixture Z Base Caf\\u00e9 \\u6587\\u732e"}'
    )
    nfd = {"displayName": "Fixture Z Base Cafe\u0301 文献"}
    expected = '{"displayName":"Fixture Z Base Café 文献"}'.encode("utf-8")
    assert mono_canonical_json_v1(literal) == expected
    assert mono_canonical_json_v1(escaped) == expected
    assert mono_canonical_json_v1(nfd) == expected
    try:
        mono_canonical_json_v1({"units": 1.0})
    except ValueError as error:
        assert "integer numeric values only" in str(error)
    else:
        raise AssertionError("MonoCanonicalJsonV1 accepted a floating-point number")
    try:
        mono_canonical_json_v1({"clé": 1})
    except ValueError as error:
        assert "object keys must be ASCII" in str(error)
    else:
        raise AssertionError("MonoCanonicalJsonV1 accepted a non-ASCII object key")
    return [
        "literal-versus-escaped-unicode",
        "nfc-versus-nfd-unicode",
        "integer-only-numeric-values",
        "ascii-object-keys",
    ]


def main() -> int:
    paths = sorted(ROOT.glob("*.json"))
    documents = [strict_json_loads(path.read_text(encoding="utf-8")) for path in paths]
    duplicate_member_probe = run_json_duplicate_member_probe()
    canonical_json_probes = run_canonical_json_probes()
    required_top = {"fixtureVersion", "fixtureId", "kind", "status", "input", "expected"}
    for path, document in zip(paths, documents):
        assert isinstance(document, dict) and set(document) == required_top, (
            f"{path.name}: unexpected top-level fields"
        )
        assert document["fixtureVersion"] == VERSION, f"{path.name}: wrong fixtureVersion"
        assert isinstance(document["fixtureId"], str) and document["fixtureId"].strip(), (
            f"{path.name}: fixtureId must be a non-empty string"
        )
        assert isinstance(document["kind"], str) and document["kind"].strip(), (
            f"{path.name}: kind must be a non-empty string"
        )
        assert document["status"] == STATUS, f"{path.name}: target fixture lacks planned status"
        assert isinstance(document["input"], dict) and isinstance(document["expected"], dict), (
            f"{path.name}: input/expected must be objects"
        )
    fixture_ids = [document["fixtureId"] for document in documents]
    assert len(fixture_ids) == len(set(fixture_ids)), "duplicate fixtureId"
    by_id = {document["fixtureId"]: document for document in documents}

    catalog = by_id["errors.catalog.v1"]
    referenced = set().union(*(referenced_error_codes(document["expected"]) for document in documents), set())
    validate_error_catalog(catalog, referenced)
    catalog_tamper_probes = run_catalog_tamper_probes(catalog, referenced)
    codes = [item["code"] for item in catalog["input"]["errors"]]

    manifest_docs = [document for document in documents if document["kind"] == "plugin-manifest"]
    available = {doc["input"]["manifest"]["id"]: doc["input"]["manifest"] for doc in manifest_docs}
    for document in manifest_docs:
        validate_manifest(document["input"]["manifest"], available)
        assert document["expected"]["valid"] is True
        assert document["expected"]["normalizedPluginId"] == document["input"]["manifest"]["id"]
        canonical_display_name = document["expected"].get("canonicalDisplayName")
        if canonical_display_name is not None:
            assert canonical_display_name == document["input"]["manifest"]["displayName"]
            assert document["expected"]["canonicalDisplayNameUtf8Hex"] == (
                mono_canonical_json_v1(canonical_display_name).hex()
            )
    dependency_order = required_dependency_order(list(available.values()))
    reverse_dependency_probe = [
        "fixture-m-peer",
        "fixture-z-base",
        "fixture-a-reader-tools",
    ]
    assert dependency_order == reverse_dependency_probe, (
        "dependency-first order must use lexical tie-breaking only among ready peers",
        dependency_order,
    )
    for document in manifest_docs:
        expected_order = document["expected"].get("requiredDependencyOrder")
        if expected_order is not None:
            assert expected_order == dependency_order, (
                document["fixtureId"], expected_order, dependency_order
            )

    invalid_manifests = by_id["manifest.invalid.cases.v1"]
    require_probe_cases(invalid_manifests["input"]["cases"], "manifest")
    expected_invalid = {item["caseId"]: item for item in invalid_manifests["expected"]["cases"]}
    for case in invalid_manifests["input"]["cases"]:
        base_fixture_id = case["baseManifestFixtureId"]
        base = by_id[base_fixture_id]["input"]["manifest"]
        invalid = apply_patch(base, case["patch"])
        try:
            validate_manifest(invalid, available)
            mutated_manifests = [
                invalid if document["fixtureId"] == base_fixture_id else document["input"]["manifest"]
                for document in manifest_docs
            ]
            required_dependency_order(mutated_manifests)
        except ContractFailure as failure:
            expected = expected_invalid[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid manifest accepted")

    registry = by_id["registry.golden.v1"]
    require_probe_cases(registry["input"]["negativeCases"], "registry")
    compiled = compile_registry_document(registry, by_id)
    expected_compiled = {
        "plan": registry["expected"]["plan"],
        "registries": registry["expected"]["registries"],
    }
    assert compiled == expected_compiled, (
        f"registry golden mismatch; computed planDigest={compiled['plan']['planDigest']}"
    )
    expected_registry_negative = {
        item["caseId"]: item for item in registry["expected"]["negativeCases"]
    }
    for case in registry["input"]["negativeCases"]:
        invalid_registry = apply_patch(registry, case["patch"])
        try:
            compile_registry_document(invalid_registry, by_id)
        except ContractFailure as failure:
            expected = expected_registry_negative[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid registry compile input accepted")

    resources = by_id["domain.resource.roundtrip.v1"]
    require_probe_cases(resources["input"]["invalid"], "resource")
    for value in resources["input"]["values"]:
        validate_resource(value)
    assert resources["input"]["values"] == resources["expected"]["roundTrip"]
    expected_resource_invalid = {item["caseId"]: item for item in resources["expected"]["invalid"]}
    for case in resources["input"]["invalid"]:
        try:
            if "resource" in case["value"]:
                validate_resource(case["value"])
            else:
                validate_domain(case["value"])
        except ContractFailure as failure:
            expected = expected_resource_invalid[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"])
        else:
            raise AssertionError(f"{case['caseId']}: invalid resource accepted")

    authority = by_id["plugin.authority.v1"]
    require_probe_cases(authority["input"]["cases"], "authority-admission")
    require_probe_cases(authority["input"]["invalidBindings"], "authority-binding")
    require_probe_cases(authority["input"]["invalidRequests"], "authority-request")
    assert authority_results(authority) == authority["expected"]["cases"]
    authority_bindings = {
        binding["bindingFixtureId"]: binding for binding in authority["input"]["bindingFixtures"]
    }
    expected_invalid_bindings = {
        item["caseId"]: item for item in authority["expected"]["invalidBindings"]
    }
    for case in authority["input"]["invalidBindings"]:
        invalid_binding = apply_patch(authority_bindings[case["baseBindingFixtureId"]], case["patch"])
        try:
            validate_authority_binding(invalid_binding)
        except ContractFailure as failure:
            expected = expected_invalid_bindings[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid authority binding accepted")

    authority_cases = {
        case["caseId"]: case for case in authority["input"]["cases"]
    }
    expected_invalid_requests = {
        item["caseId"]: item for item in authority["expected"]["invalidRequests"]
    }
    for case in authority["input"]["invalidRequests"]:
        invalid_request = apply_patch(authority_cases[case["baseCaseId"]], case["patch"])
        probe_document = {
            "input": {
                "quotaWindowDurationMs": authority["input"]["quotaWindowDurationMs"],
                "bindingFixtures": authority["input"]["bindingFixtures"],
                "admissionLedgerFixtures": authority["input"]["admissionLedgerFixtures"],
                "consentEvidenceFixtures": authority["input"]["consentEvidenceFixtures"],
                "cases": [invalid_request],
                "invalidBindings": [],
                "invalidRequests": [],
            }
        }
        try:
            authority_results(probe_document)
        except ContractFailure as failure:
            expected = expected_invalid_requests[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid authority request accepted")

    valid_jobs = by_id["job.lifecycle.valid.v1"]
    require_probe_cases(valid_jobs["input"]["cases"], "job-valid")
    valid_results = [validate_job(case) for case in valid_jobs["input"]["cases"]]
    assert valid_results == valid_jobs["expected"]["cases"]
    valid_job_cases = {case["caseId"]: case for case in valid_jobs["input"]["cases"]}
    invalid_jobs = by_id["job.lifecycle.invalid.v1"]
    require_probe_cases(invalid_jobs["input"]["cases"], "job-invalid")
    expected_jobs = {item["caseId"]: item for item in invalid_jobs["expected"]["cases"]}
    for case in invalid_jobs["input"]["cases"]:
        invalid = apply_patch(valid_job_cases[case["baseCaseId"]], case["patch"])
        try:
            validate_job(invalid)
        except ContractFailure as failure:
            expected = expected_jobs[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid job accepted")

    startup = by_id["startup.network.v1"]
    require_probe_cases(startup["input"]["negativeCases"], "startup")
    validate_startup(startup)
    expected_startup_cases = {
        item["caseId"]: item for item in startup["expected"]["negativeCases"]
    }
    for case in startup["input"]["negativeCases"]:
        invalid_startup = apply_patch(startup, case["patch"])
        try:
            validate_startup(invalid_startup)
        except ContractFailure as failure:
            expected = expected_startup_cases[case["caseId"]]
            assert (failure.code, failure.path) == (expected["errorCode"], expected["path"]), (
                case["caseId"], failure.code, failure.path, expected
            )
        else:
            raise AssertionError(f"{case['caseId']}: invalid startup contract accepted")

    for document in documents:
        for collection in (
            "cases", "invalidBindings", "invalidRequests", "negativeCases", "invalid"
        ):
            input_cases = document["input"].get(collection, [])
            expected_cases = document["expected"].get(collection, [])
            input_ids = [item["caseId"] for item in input_cases]
            expected_ids = [item["caseId"] for item in expected_cases]
            assert len(input_ids) == len(set(input_ids)), (
                f"{document['fixtureId']}: duplicate input {collection} caseId"
            )
            if expected_ids:
                assert len(expected_ids) == len(set(expected_ids)), (
                    f"{document['fixtureId']}: duplicate expected {collection} caseId"
                )
                assert set(input_ids) == set(expected_ids), (
                    f"{document['fixtureId']}: input/expected {collection} case mismatch"
                )

    probe_counts = {
        "manifest": len(invalid_manifests["input"]["cases"]),
        "registry": len(registry["input"]["negativeCases"]),
        "authority-grant": len(authority["input"]["invalidBindings"]),
        "authority-request": len(authority["input"]["invalidRequests"]),
        "resource": len(resources["input"]["invalid"]),
        "job": len(invalid_jobs["input"]["cases"]),
        "startup": len(startup["input"]["negativeCases"]),
    }
    print(
        f"validated {len(documents)} target-mono-v1 fixtures, "
        f"{len(codes)} error codes, planDigest={compiled['plan']['planDigest']}"
    )
    print(
        "validated negative probes: "
        + ", ".join(f"{name}={count}" for name, count in probe_counts.items())
    )
    print(
        "validated error-catalog tamper probes: " + ", ".join(catalog_tamper_probes)
    )
    print("validated strict JSON probe: " + duplicate_member_probe)
    print("validated canonical JSON probes: " + ", ".join(canonical_json_probes))
    print("validated registry topology probe: " + " -> ".join(reverse_dependency_probe))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, ContractFailure, KeyError, TypeError, ValueError) as error:
        print(f"fixture validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
