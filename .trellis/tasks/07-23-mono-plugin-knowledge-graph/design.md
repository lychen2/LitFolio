# Extract Knowledge Graph Plugin - Design

## 1. Scope / Trigger

Extract graph data and presentation after the host is stable. Keep paper metadata canonical in core and graph relationships/provenance in the plugin sidecar.

## 2. Signatures

```ts
type GraphNode = {
  paperId: string;
  title?: string;
  unresolved: boolean;
};

type GraphEdge = {
  id: string;
  sourcePaperId: string;
  targetPaperId: string;
  relation: string;
  origin: "manual" | "ai" | "citation" | "similarity";
  decision: "accepted" | "pending" | "rejected";
};
```

Plugin API groups graph data, link CRUD/decision, concepts, citations, similarity, and explicit AI discovery. `/graph` and Library/paper actions are slot contributions.

Sidecar tables reproduce link/concept/citation semantics and add migration/provenance metadata where needed. No sidecar FK references core tables.

## 3. Contracts

- Core paper IDs identify nodes; display metadata is resolved in batches through `papers` capability.
- Missing papers remain unresolved nodes/edges and can be exported or repaired.
- Manual links are never overwritten by AI/citation refreshes.
- Suggestion decisions and provenance survive refresh/migration.
- Network citation/similarity calls are explicit or plugin-scheduled under declared policy, cancellable, and SSRF-safe.
- AI concept/link extraction uses bounded authorized paper content and records model/time.
- Graph rendering code enters only through the plugin entry; no core static import.
- Generic citation-format export remains core and can consume core metadata independently.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| paper missing | unresolved node/reference retained |
| duplicate manual edge | deterministic existing edge/no duplicate |
| generated edge matches manual | manual wins; provenance preserved separately if needed |
| network denied/fails | structured recoverable discovery error |
| AI profile missing | manual graph works; AI action configured-state only |
| disable during discovery | cancellation; committed sidecar state consistent |
| large graph | bounded rendering/update path passes performance threshold |
| migration failure | sidecar rollback; core starts |

## 5. Good / Base / Bad Cases

- Good: manual edge remains accepted after citation refresh; an unavailable paper displays as unresolved without deleting the edge.
- Base: no AI profile still supports manual links, concepts, graph, and cached citations.
- Bad: graph tables keep FKs into core DB or `LibraryPage` statically imports the graph renderer.

## 6. Tests Required

- Link CRUD/uniqueness/provenance/decision and concept-relation tests.
- Citation direction and similarity result conversion tests.
- Missing paper and manual-vs-generated merge tests.
- Sidecar `0010`/`0017`/`0024` migration, count, idempotence, and rollback tests.
- Network/AI permission, cancellation, no-profile, and disable tests.
- Existing graph edge-action, decision-signal, sidebar, and performance tests.
- Core-only chunk absence evidence for later pruning and Graph E2E now.

## 7. Wrong vs Correct

Wrong:

```ts
import NetworkGraphView from "@/pages/graph/NetworkGraphView";
```

from core Library.

Correct: `knowledge-graph` registers a `library.detailSections` contribution and owns the lazy graph-renderer import inside its plugin entry.
