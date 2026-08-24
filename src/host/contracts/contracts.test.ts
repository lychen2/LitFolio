import jobInvalidFixture from "../../test/fixtures/mono-v1/job-lifecycle-invalid.json";
import jobValidFixture from "../../test/fixtures/mono-v1/job-lifecycle-valid.json";
import { describe, expect, it } from "vitest";

import { ContractError, parseResourceRefV1 } from "@/core/contracts";
import { validateJobLifecycleV1 } from "@/host/contracts";
import { parsePluginManifestSetV1, parsePluginManifestV1 } from "@/plugin-sdk/contracts";

const CONTRACT_VERSION = "target-mono-v1";
const SHA256 = "a".repeat(64);

const manifestMinimalFixture = fixture("manifest.valid.minimal.v1", manifest("fixture-minimal"));
const manifestDependentFixture = fixture(
  "manifest.valid.dependent.v1",
  manifest("fixture-dependent", [{ id: "fixture-minimal", version: "^1.0.0", optional: false }]),
);
const manifestPeerFixture = fixture(
  "manifest.valid.peer.v1",
  manifest("fixture-peer", [{ id: "fixture-dependent", version: "^1.0.0", optional: true }]),
);
const manifestInvalidFixture = {
  input: {
    cases: [
      { caseId: "invalid-id", baseManifestFixtureId: "manifest.valid.minimal.v1", patch: [{ op: "replace", path: "/id", value: "Fixture" }] },
      { caseId: "unknown-field", baseManifestFixtureId: "manifest.valid.minimal.v1", patch: [{ op: "add", path: "/unexpected", value: true }] },
      { caseId: "missing-dependency", baseManifestFixtureId: "manifest.valid.dependent.v1", patch: [{ op: "replace", path: "/dependencies/0/id", value: "missing-plugin" }] },
    ],
  },
};
const domainResourceFixture = {
  input: {
    values: [
      resource("paper-1", null),
      resource("source-segment-1", { kind: "number", value: "2" }, "source-segment"),
      resource("revision-1", { kind: "sha256", value: SHA256 }, "document-revision"),
    ],
    invalid: [
      { caseId: "invalid-domain", value: resource("paper-1", null, "unknown") },
      { caseId: "invalid-revision", value: resource("paper-1", { kind: "number", value: "01" }) },
    ],
  },
};

function fixture(fixtureId: string, manifestValue: Record<string, unknown>) {
  return { fixtureId, input: { manifest: manifestValue } };
}

function manifest(id: string, dependencies: Array<{ id: string; version: string; optional: boolean }> = []) {
  return {
    apiVersion: 1,
    id,
    version: "1.0.0",
    coreApi: "^1.0.0",
    displayName: id,
    activation: {},
    dependencies,
    requestedCapabilities: [],
    contributions: [],
    storage: { kind: "none", schemaVersion: 0, retention: "preserve-on-disable" },
    migrations: [],
    build: {},
  };
}

function resource(
  id: string,
  revision: { kind: string; value: string } | null,
  domain = "paper",
) {
  return {
    contractVersion: CONTRACT_VERSION,
    resource: { contractVersion: CONTRACT_VERSION, domain, id },
    revision,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function patch(target: unknown, operations: Array<{ op: string; path: string; value?: unknown }>): unknown {
  const result = clone(target) as Record<string, unknown>;
  for (const operation of operations) {
    const keys = operation.path.slice(1).split("/");
    let parent: Record<string, unknown> | unknown[] = result;
    for (const key of keys.slice(0, -1)) {
      parent = Array.isArray(parent)
        ? (parent[Number(key)] as Record<string, unknown>)
        : (parent[key] as Record<string, unknown>);
    }
    const key = keys.at(-1)!;
    if (operation.op === "remove") Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key];
    else if (Array.isArray(parent) && key === "-") parent.push(operation.value);
    else if (Array.isArray(parent)) parent[Number(key)] = operation.value;
    else parent[key] = operation.value;
  }
  return result;
}

describe("target-mono-v1 TypeScript contract consumer", () => {
  const manifests: Record<string, unknown> = {
    [manifestMinimalFixture.fixtureId]: manifestMinimalFixture.input.manifest,
    [manifestDependentFixture.fixtureId]: manifestDependentFixture.input.manifest,
    [manifestPeerFixture.fixtureId]: manifestPeerFixture.input.manifest,
  };

  it.each(Object.entries(manifests))("accepts local manifest fixture %s", (_fixtureId, value) => {
    expect(parsePluginManifestV1(value).id).toMatch(/^fixture-/);
  });

  it("accepts the complete local manifest set", () => {
    expect(parsePluginManifestSetV1(Object.values(manifests))).toHaveLength(3);
  });

  it.each(manifestInvalidFixture.input.cases)("rejects $caseId", (item) => {
    const base = manifests[item.baseManifestFixtureId];
    expect(base, `unknown base manifest ${item.baseManifestFixtureId}`).toBeDefined();
    const candidate = patch(base, item.patch);
    expect(() => parsePluginManifestSetV1(Object.entries(manifests).map(([fixtureId, value]) => (
      fixtureId === item.baseManifestFixtureId ? candidate : value
    )))).toThrow(ContractError);
  });

  it.each(domainResourceFixture.input.values)("round-trips local resource value %#", (value) => {
    expect(parseResourceRefV1(value)).toEqual(value);
  });

  it.each(domainResourceFixture.input.invalid)("rejects forbidden resource reference $caseId", (item) => {
    expect(() => parseResourceRefV1(item.value)).toThrow(ContractError);
  });

  it.each(jobValidFixture.input.cases)("accepts local job lifecycle $caseId", (item) => {
    expect(validateJobLifecycleV1(item.record, item.events)).toEqual(item.record);
  });

  it.each(jobInvalidFixture.input.cases)("rejects invalid job stream $caseId", (item) => {
    const base = jobValidFixture.input.cases.find((entry) => entry.caseId === item.baseCaseId);
    expect(base, `unknown base job case ${item.baseCaseId}`).toBeDefined();
    const mutated = patch(base, item.patch) as { record: unknown; events: unknown[] };
    expect(() => validateJobLifecycleV1(mutated.record, mutated.events)).toThrow(ContractError);
  });
});
