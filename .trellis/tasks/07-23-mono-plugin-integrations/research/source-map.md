# Integration Plugin Source Map

## Sync

- `SyncPanel.tsx`, `syncApi.ts`, and `syncSecurity.ts` expose current settings and client safety logic.
- `commands/sync.rs` and `library_sync/` implement local/WebDAV preview, push, pull, config, and tests.
- Current backend `AppState` includes a sync lock and current code can reach full library paths directly.

## Document Services

- `mineru.rs` and profile `pdf_markdown` config represent optional document parsing.
- `ObsidianSettings.tsx` and profile `obsidian` config are mixed into core AI config.
- export and supplement commands contain Obsidian and DOCX-to-PDF/conversion behavior.
- Core `paper_documents` and PDFJS-produced `document.md` remain core-owned.

## Security Boundary

Sync cannot satisfy plugin isolation by reading every plugin directory. The host must create/apply versioned snapshots and call plugin export/import hooks. Document services receive scoped file handles and network/secrets, not arbitrary paths or frontend-visible tokens.

## Configuration Risk

Legacy fields are spread across config structures and keyring-backed secrets. Migration must preserve unknown fields until every owning plugin has converted them and must never serialize secrets into plain JSON/logs.
