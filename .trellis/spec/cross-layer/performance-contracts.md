# Performance Contracts

## Status

This document is a planned Mono contract. It becomes current only as each owning child lands its benchmark fixture and implementation.

## Scenario: Measured Algorithm Adoption

### 1. Scope / Trigger

Use this contract when a change claims lower latency, memory, CPU, database I/O, startup work, or asymptotic complexity across React, Tauri IPC, Rust, SQLite, filesystem storage, or a plugin sidecar.

An optimization is not accepted from source analogy or a single developer-machine timing. It needs a reproducible benchmark descriptor, a correctness oracle, an owning component, and a failure policy.

### 2. Signatures

```ts
type CacheCondition = "cold-process" | "warm-page-cache" | "warm-index";

type BenchmarkDescriptor = {
  id: string;
  owner: "core" | `plugin:${string}`;
  implementationVersion: string;
  datasetId: string;
  datasetSha256: string;
  datasetShape: Record<string, number>;
  cacheCondition: CacheCondition;
  hardwareClass: string;
  warmupRuns: number;
  measuredRuns: number;
  complexityTarget: string;
  thresholds: Array<{
    metric: string;
    comparison: "lte" | "gte" | "eq";
    value: number;
    unit: string;
  }>;
  correctnessOracle: string;
  failurePolicy: "retain-baseline" | "select-reviewed-backend";
};

type BenchmarkResult = {
  descriptorId: string;
  descriptorDigest: string;
  implementationVersion: string;
  samples: Record<string, number[]>;
  summary: Record<string, number>;
  correctnessPassed: boolean;
  thresholdPassed: boolean;
};
```

A benchmark fixture must be runnable without network access unless the measured operation is explicitly a network capability. Network-provider latency must be reported separately from local algorithm latency.

### 3. Contracts

- The descriptor is committed with the owning implementation or test fixture.
- Dataset shape and SHA-256 identify the exact corpus; generated fixtures also pin generator version and seed.
- Cold and warm conditions are separate results. A report must not label a warm result as startup or first-use latency.
- Correctness runs before threshold evaluation. Incorrect output cannot pass because it is fast.
- Core and plugin time are reported separately when IPC or capability mediation is involved.
- Threshold failures retain the existing implementation or require a separately reviewed backend. They never permit weaker provenance, atomicity, cancellation, authorization, offline startup, or data preservation.
- Optional semantic retrieval benchmarks include candidate recall, index build/update time, memory, cold/warm query latency, and supported corpus ceiling. RRF timing alone does not prove vector-search scalability.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing dataset digest, cache condition, hardware class, or implementation version | `benchmark_descriptor_invalid`; result is not comparable |
| Correctness oracle fails | `benchmark_correctness_failed`; do not evaluate adoption threshold |
| Threshold fails with correctness intact | Keep baseline or open a reviewed backend decision |
| Claimed corpus size exceeds measured fixture | Report unsupported scale; do not extrapolate |
| Network work appears in a core startup fixture | `zero_network_startup_failed`; reject the change |
| Cancellation benchmark observes a late commit/success | `lifecycle_terminality_failed`; reject regardless of latency |
| Fault injection produces partial or duplicate state | `atomicity_failed`; reject regardless of throughput |

### 5. Good / Base / Bad Cases

- Good: the indexed-backlink benchmark pins one million references, runs from a cold process, checks exact result identity, and records p95 plus SQL/IPC counts.
- Base: a microbenchmark may guide local tuning, but it is not release evidence until its descriptor and fixture are reproducible.
- Bad: report one warm run on an unspecified laptop, omit correctness/recall, and replace the baseline because the mean looked faster.

### 6. Tests Required

- Descriptor parser test: reject missing identity, environment, threshold, oracle, and failure-policy fields.
- Reproducibility test: the same fixture generator version and seed produce the declared dataset SHA-256.
- Correctness-before-speed test: an intentionally wrong fast implementation cannot pass.
- Regression test: compare p50/p95/p99, peak memory, and operation-specific I/O counts against declared thresholds.
- Failure-policy test: a threshold miss leaves the baseline selected and user data unchanged.
- Ownership test: core-only runs do not initialize plugin indexes, models, sidecars, schedules, or network clients.

### 7. Wrong vs Correct

#### Wrong

```ts
if (newDurationMs < oldDurationMs) {
  enableNewBackend();
}
```

This omits corpus identity, cache state, correctness, tail latency, memory, I/O, ownership, and rollback.

#### Correct

```ts
const result = await runBenchmark(descriptor, implementation);
assert(result.correctnessPassed);

if (result.thresholdPassed) {
  selectImplementation(descriptor.owner, descriptor.implementationVersion);
} else {
  retainBaseline(descriptor.failurePolicy);
}
```

The implementation-selection step is explicit, attributable to the owning core/plugin component, and reversible.

## Planned Mono Gates

The NeuInk-informed plan currently assigns these gates to owning children:

- Core provenance: indexed backlinks, single-pass segment validation, bounded remapping, and atomic/journal recovery.
- Core host/jobs: real cancellation, terminal late-result suppression, event sequencing, and progress-write coalescing.
- `library-ask`: bounded Top-K RRF, changed-only embedding work, and separately proven vector candidate retrieval.

The task plans contain their concrete fixture sizes and thresholds. This spec defines the shared evidence format and adoption behavior.
