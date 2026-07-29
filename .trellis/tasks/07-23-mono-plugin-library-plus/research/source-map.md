# Library Plus Source Map

## Current UI

- Library panels/components own queue, smart collections, custom fields, and supplements directly.
- Settings owns duplicate scan/merge and custom-field management.
- These are embedded into core Library/Settings without contribution boundaries.

## Current Data

- `0019`: reading queue keyed by core paper ID.
- `0020`: smart collection name plus serialized rules.
- `0021`: custom definitions and paper values with core FKs.
- `0035`: supplement metadata with absolute/string paths and optional converted PDF path.
- Duplicate detection/merge operates directly on the core pool and has no dedicated plugin table.

## Boundary Decisions

- Smart rules become a validated AST executed by core paper-query capability.
- Duplicate UI/workflow is optional, but canonical merge remains a core transaction.
- New supplement files are plugin-scoped; legacy files/paths are copied or archived with checksums.
- Document conversion is optional integration, not a hard dependency.
