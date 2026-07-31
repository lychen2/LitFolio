import domainResourceFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/domain-resource-roundtrip.json";
import jobInvalidFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-invalid.json";
import jobValidFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/job-lifecycle-valid.json";
import manifestInvalidFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-invalid-cases.json";
import manifestDependentFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-valid-dependent.json";
import manifestMinimalFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-valid-minimal.json";
import manifestPeerFixture from "../../../.trellis/spec/cross-layer/fixtures/mono-v1/manifest-valid-peer.json";
import { describe, expect, it } from "vitest";
import { ContractError, parseResourceRefV1 } from "@/core/contracts";
import { validateJobLifecycleV1 } from "@/host/contracts";
import { parsePluginManifestSetV1, parsePluginManifestV1 } from "@/plugin-sdk/contracts";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function patch(target: unknown, operations: Array<{ op: string; path: string; value?: unknown }>): unknown {
  const result = clone(target) as Record<string, unknown>;
  for (const operation of operations) {
    const keys = operation.path.slice(1).split("/"); let parent: Record<string, unknown> | unknown[] = result;
    for (const key of keys.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(key)] as Record<string, unknown> : parent[key] as Record<string, unknown>;
    const key = keys.at(-1)!;
    if (operation.op === "remove") Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key];
    else if (Array.isArray(parent) && key === "-") parent.push(operation.value);
    else if (Array.isArray(parent)) parent[Number(key)] = operation.value;
    else parent[key] = operation.value;
  }
  return result;
}

describe("target-mono-v1 TypeScript contract consumer", () => {
  it.each([
    ["manifest.valid.minimal.v1", manifestMinimalFixture.input.manifest],
    ["manifest.valid.dependent.v1", manifestDependentFixture.input.manifest],
    ["manifest.valid.peer.v1", manifestPeerFixture.input.manifest],
  ])("accepts canonical manifest fixture %s", (_fixtureId, manifest) => {
    expect(parsePluginManifestV1(manifest).id).toMatch(/^fixture-/);
  });

  describe("canonical malformed manifest declarations", () => {
    const manifests: Record<string, unknown> = {
      [manifestMinimalFixture.fixtureId]: manifestMinimalFixture.input.manifest,
      [manifestDependentFixture.fixtureId]: manifestDependentFixture.input.manifest,
      [manifestPeerFixture.fixtureId]: manifestPeerFixture.input.manifest,
    };

    it("accepts the complete canonical manifest set", () => {
      expect(parsePluginManifestSetV1(Object.values(manifests))).toHaveLength(3);
    });

    it.each(manifestInvalidFixture.input.cases)("rejects $caseId", (item) => {
      const base = manifests[item.baseManifestFixtureId];
      expect(base, `unknown base manifest ${item.baseManifestFixtureId}`).toBeDefined();
      const candidate = patch(base, item.patch);
      expect(() => parsePluginManifestSetV1(Object.entries(manifests).map(([fixtureId, manifest]) =>
        fixtureId === item.baseManifestFixtureId ? candidate : manifest,
      ))).toThrow(ContractError);
    });
  });

  it.each(domainResourceFixture.input.values)("round-trips canonical resource value %#", (value) => {
    expect(parseResourceRefV1(value)).toEqual(value);
  });

  it.each(domainResourceFixture.input.invalid)("rejects forbidden resource reference $caseId", (item) => {
    expect(() => parseResourceRefV1(item.value)).toThrow(ContractError);
  });

  it.each(jobValidFixture.input.cases)("accepts canonical job lifecycle $caseId", (item) => {
    expect(validateJobLifecycleV1(item.record, item.events)).toEqual(item.record);
  });

  describe("canonical invalid job event streams", () => {
    const baseCases = new Map(jobValidFixture.input.cases.map((item) => [item.caseId, item]));

    it.each(jobInvalidFixture.input.cases)("rejects $caseId", (item) => {
      const base = baseCases.get(item.baseCaseId);
      expect(base, `unknown base job case ${item.baseCaseId}`).toBeDefined();
      const mutated = patch(base, item.patch) as { record: unknown; events: unknown[] };
      expect(() => validateJobLifecycleV1(mutated.record, mutated.events)).toThrow(ContractError);
    });
  });
});
