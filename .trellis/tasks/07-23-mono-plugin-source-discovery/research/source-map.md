# Source and Discovery Source Map

## Source Connector Inputs

- `commands/imports.rs` combines local and remote import commands.
- `ingest/doi.rs` and `ingest/arxiv.rs` own remote metadata acquisition.
- `BrowsePage.tsx`, Import search/DOI/arXiv panels, and Reader DOI import use these paths.
- PDF download commands and external HTTP safety must remain behind host network/file policy.

## Discovery Inputs

- Routes: Browse, Feeds, Topic, Candidate Inbox.
- Commands/storage: feeds, feed metadata, candidates, topic alerts, recommendations/discovery.
- Data migrations: feeds `0006`, recommendation cache `0016`, topic alerts `0022`, feed metadata `0025`, candidate inbox `0027`, normalized-title dedupe `0028`.

## Coupling to Break

- Feed/candidate UI can currently invoke import APIs directly.
- Shell queries topic-alert unseen count even when discovery should be optional.
- Navigation and command palette always include all discovery routes.
- Feed parsing dependency is unconditional in Cargo.

## Ownership Decision

Topic survey and query expansion are owned by `discovery-feeds` because they serve the Topic discovery workflow; they request the core AI capability. Current-paper AI Reading remains core. Citation/similarity graph workflows are owned by `knowledge-graph`.
