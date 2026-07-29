# Current Worktree Risk

## Snapshot

At parent-planning inspection, `git status --short` reported 137 changed paths. This is a shared, dirty worktree with modified frontend, backend, test, style, and i18n files plus untracked Trellis and UI files.

High-overlap paths include:

- `src-tauri/src/commands/mod.rs`;
- `src-tauri/src/ai/profile.rs` and tests;
- `src-tauri/src/commands/papers.rs`, PDF commands, export code, and paper storage;
- `src/App.tsx`, `src/main.tsx`, `src/components/Shell.tsx`, onboarding, and navigation;
- `src/lib/api.ts`, API schema/types, knowledge API, and parity/navigation tests;
- all major route pages, especially Library, Reader, Settings, Ask, Browse, Feeds, Graph, Projects, and Topic;
- Reader note/selection/translation/highlight components and reader CSS;
- E2E smoke files plus untracked UI smoke coverage;
- the entire current `.trellis/` task/spec/workspace setup is untracked.

The exact count is informational and can change as the user works. The invariant is that unrelated changes are user-owned and must be preserved.

## Failure Modes

- Broad directory moves can accidentally combine Mono work with unreviewed user edits.
- Replacing a whole modified file from an older base can erase current work.
- `git clean` can delete the untracked Trellis task tree and new UI files.
- `git checkout --`, `git restore`, or reset operations can revert user changes.
- Mechanical formatting across `src/` or `src-tauri/` can make ownership and review impossible.
- A broad commit can capture unrelated work.

## Required Safeguards

Before each implementation child:

1. Capture `git status --short` and the diff for files the child expects to touch.
2. Read current file contents immediately before editing; do not apply a plan against remembered snapshots.
3. Keep edits within the child-owned boundary and preserve adjacent user changes.
4. Use focused formatting/testing commands; avoid repository-wide rewrites.
5. Recheck status and diff after each logical step, identifying only task-owned changes.

Never use these commands as part of the Mono workflow:

```text
git reset --hard
git clean -fd or variants
git checkout -- <path>
git restore <path>
```

Do not stash the user's worktree unless the user explicitly asks for that destructive/context-switching operation and approves the exact scope.

## Commit Boundary

The eventual Trellis finish flow must stage explicit task-owned paths. It must not use blanket staging such as `git add -A` in this worktree. Before commit, compare the staged diff against the child acceptance criteria and verify that unrelated modified/untracked paths remain unstaged and unchanged.

## Planning Safety

This planning continuation edits only `.trellis/tasks/07-23-litfolio-mono` and its existing child task directories. It does not modify application source, finish the independent bootstrap task, or start an implementation task.
