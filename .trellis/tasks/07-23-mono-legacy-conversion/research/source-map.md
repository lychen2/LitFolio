# Legacy Conversion Source Map

## Current State

- Historical SQLx migrations are `0001` through `0035` and mix core/plugin ownership.
- Only `src-tauri/tests/fixtures/old_0001_library.sql` is an explicit old-library fixture at planning time.
- `startup.rs` currently bootstraps paths/pool/migrations into normal `AppState`.
- `LibraryPaths` currently owns one root with `library.db`, papers, notes, vectors, attachments, backups, logs, and config.

## Required Inputs From Children

- Reader: `pdf_notes`, sentinel converter, Markdown/note-section archive exporter.
- Provenance reading: accepted revision/segment, source-link/snapshot/backlink, canonical Markdown/asset, remap, and export verification schemas.
- AI: final core profile/config/output ownership and secret compatibility.
- Host: canonical manifest compiler, digest-bound resolved-inclusion schema, plugin registry, sidecar path/migrator, and feature-neutral excluded-owner archive descriptors.
- Each plugin: final sidecar schema, owned legacy tables/files/config, idempotent converter and verifier.

## Inclusion Decision

- Conversion consumes the canonical compiler output; it does not own manifest metadata or accept plugin ID strings.
- Included-but-disabled owners migrate to sidecars without activation and retain disabled runtime state.
- Excluded owners migrate to reversible archives carrying owner/schema/plan provenance, counts, checksums, and restore requirements.
- Core provenance is never assigned to `document-services`; accepted revisions, segments, source evidence, backlinks, and export inputs survive a core-only build.
- Plan/schema/manifest/profile/migrator digest drift is a pre-write stale-plan failure and requires a new preview.

## Key Risk

Running normal SQLx migrations against the only legacy DB cannot produce the required core/plugin split safely. Conversion must happen before normal writable bootstrap, against read-only source plus verified backup and staging. Accepting an ad hoc or stale inclusion plan can select the wrong migrator or disposition and is treated as equally unsafe.

## Fixture Strategy

Apply historical migrations incrementally to create every boundary fixture rather than manually maintaining 35 full SQL dumps. Seed only tables/columns available at each boundary and include mixed rich fixtures at key versions such as `0001`, `0015`, `0024`, `0030`, and `0035`. Cross each fixture with included-enabled, included-disabled, and excluded profiles; add accepted provenance before excluding `document-services`, stale-plan variants, archive restoration, failure injection, and second-run checks.
