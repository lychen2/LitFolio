#!/usr/bin/env python3
"""Validate Trellis spec links, indexes, anchors, ownership, and Mono fixtures."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

SPEC_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SPEC_ROOT.parents[1]
LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
CODE_PATH = re.compile(
    r"`((?:\.trellis/(?:tasks|spec)/|src(?:-tauri)?/|e2e/|scripts/|"
    r"package\.json|vite\.config\.ts)[^`\n]*)`"
)
PLACEHOLDER = re.compile("To be filled" + r" by the team|\bT" + r"BD\b")

INDEX_MEMBERS = {
    "frontend/index.md": {
        "component-guidelines.md", "directory-structure.md", "hook-guidelines.md",
        "quality-guidelines.md", "state-management.md", "type-safety.md",
    },
    "backend/index.md": {"tauri-commands.md", "storage-and-migrations.md", "error-handling.md"},
    "cross-layer/index.md": {
        "api-contracts.md", "plugin-capabilities.md", "reader-annotations.md",
        "mono-contracts.md", "startup-network.md", "performance-contracts.md",
    },
    "guides/index.md": {"code-reuse-thinking-guide.md", "cross-layer-thinking-guide.md"},
}

REQUIRED_ANCHORS = [
    "src/main.tsx",
    "src/lib/autoUpdate.ts",
    "src/lib/autoUpdate.test.ts",
    "src/lib/apiInvoke.ts",
    "src/lib/apiSchema.ts",
    "src/lib/apiSchemaCore.ts",
    "src/lib/apiSchema.test.ts",
    "src/lib/tauriCommandParity.test.ts",
    "src/lib/error.ts",
    "src/test/tauriMockCommands.ts",
    "src-tauri/src/lib.rs",
    "src-tauri/src/commands/mod.rs",
    "src-tauri/src/startup.rs",
    "src-tauri/src/storage/db.rs",
    "src-tauri/src/storage/paths.rs",
    ".trellis/tasks/07-23-litfolio-mono/prd.md",
    ".trellis/tasks/07-23-litfolio-mono/design.md",
    ".trellis/tasks/07-23-litfolio-mono/implement.md",
]


TASK_CONTRACT_DOCS = [
    REPO_ROOT / f".trellis/tasks/{task}/{name}.md"
    for task in (
        "07-23-litfolio-mono",
        "07-23-mono-plugin-host-sdk",
        "07-23-mono-build-pruning",
    )
    for name in ("prd", "design", "implement")
]


def markdown_anchor(title: str) -> str:
    value = re.sub(r"<[^>]+>", "", title)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_~]", "", value.casefold())
    value = re.sub(r"[^\w\s-]", "", value)
    return re.sub(r"[\s-]+", "-", value).strip("-")


def markdown_headings(text: str) -> list[tuple[int, str, str]]:
    headings: list[tuple[int, str, str]] = []
    lines = text.splitlines()
    fenced = False
    index = 0
    while index < len(lines):
        line = lines[index]
        if re.match(r"^[ ]{0,3}(?:```|~~~)", line):
            fenced = not fenced
            index += 1
            continue
        if fenced:
            index += 1
            continue
        match = re.match(r"^[ ]{0,3}(#{1,6})(?:[ \t]+|$)(.*?)[ \t]*$", line)
        if match:
            title = re.sub(r"[ \t]+#+[ \t]*$", "", match.group(2))
            if title:
                headings.append((len(match.group(1)), title, markdown_anchor(title)))
            index += 1
            continue
        if index + 1 < len(lines) and line.strip():
            underline = re.match(r"^[ ]{0,3}(=+|-+)[ \t]*$", lines[index + 1])
            if underline:
                level = 1 if underline.group(1).startswith("=") else 2
                title = line.strip()
                headings.append((level, title, markdown_anchor(title)))
                index += 2
                continue
        index += 1
    return headings


def duplicate_markdown_anchors(text: str) -> list[str]:
    anchors = [anchor for _, _, anchor in markdown_headings(text) if anchor]
    return sorted({anchor for anchor in anchors if anchors.count(anchor) > 1})


def ensure_no_duplicate_anchors(text: str, label: str) -> None:
    duplicates = duplicate_markdown_anchors(text)
    if duplicates:
        fail(f"duplicate normalized Markdown anchors in {label}: {duplicates}")


def ensure_single_manifest_owner(definitions: list[str]) -> None:
    if len(definitions) != 1 or not definitions[0].startswith(
        ".trellis/spec/cross-layer/mono-contracts.md:"
    ):
        fail(f"PluginManifestV1 must have one spec owner, found: {definitions}")


def local_link_target(document: Path, raw: str) -> Path | None:
    target = raw.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1]
    target = target.split("#", 1)[0]
    if not target or target.startswith(("http://", "https://", "mailto:")):
        return None
    return (document.parent / target).resolve()


def current_source_path_exists(raw: str) -> bool:
    path = REPO_ROOT / raw.rstrip("/")
    return path.exists() or path.with_suffix(".ts").exists() or path.with_suffix(".tsx").exists()


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> int:
    markdown = sorted(SPEC_ROOT.rglob("*.md"))
    if not markdown:
        fail("no spec Markdown files found")

    broken: list[str] = []
    missing_paths: list[str] = []
    for document in markdown:
        text = document.read_text(encoding="utf-8")
        ensure_no_duplicate_anchors(text, str(document.relative_to(REPO_ROOT)))
        match = PLACEHOLDER.search(text)
        if match:
            fail(f"placeholder {match.group(0)!r} in {document.relative_to(REPO_ROOT)}")
        for raw in LINK.findall(text):
            target = local_link_target(document, raw)
            if target is not None and not target.exists():
                broken.append(f"{document.relative_to(REPO_ROOT)} -> {raw}")
        if document.relative_to(SPEC_ROOT).parts[0] != "guides":
            for raw in CODE_PATH.findall(text):
                if any(marker in raw for marker in ("*", "<", ">", " ")):
                    continue
                if not current_source_path_exists(raw):
                    missing_paths.append(f"{document.relative_to(REPO_ROOT)} -> {raw}")
    if broken:
        fail("broken Markdown links:\n" + "\n".join(broken))
    if missing_paths:
        fail("missing exact source/task paths:\n" + "\n".join(missing_paths))

    for index_name, expected_names in INDEX_MEMBERS.items():
        index_path = SPEC_ROOT / index_name
        text = index_path.read_text(encoding="utf-8")
        linked = {
            local_link_target(index_path, raw).name
            for raw in LINK.findall(text)
            if local_link_target(index_path, raw) is not None
        }
        missing = expected_names - linked
        if missing:
            fail(f"{index_name} does not link: {sorted(missing)}")

    cross_links = {
        "frontend/index.md": {"../backend/index.md", "../cross-layer/index.md", "../guides/index.md"},
        "backend/index.md": {"../frontend/index.md", "../cross-layer/api-contracts.md", "../guides/cross-layer-thinking-guide.md"},
        "cross-layer/index.md": {"../frontend/index.md", "../backend/index.md", "../guides/cross-layer-thinking-guide.md"},
        "guides/index.md": {"../frontend/index.md", "../backend/index.md", "../cross-layer/index.md"},
    }
    for index_name, required_fragments in cross_links.items():
        text = (SPEC_ROOT / index_name).read_text(encoding="utf-8")
        missing = {fragment for fragment in required_fragments if fragment not in text}
        if missing:
            fail(f"{index_name} missing cross-layer links: {sorted(missing)}")

    definitions = []
    definition_documents = markdown + TASK_CONTRACT_DOCS
    for document in definition_documents:
        for line_number, line in enumerate(document.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(r"^(?:interface|type) PluginManifestV1\b", line):
                definitions.append(f"{document.relative_to(REPO_ROOT)}:{line_number}")
    ensure_single_manifest_owner(definitions)

    duplicate_error_catalogs = []
    for document in TASK_CONTRACT_DOCS:
        for line_number, line in enumerate(document.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(r"^type PluginErrorCode\b", line):
                duplicate_error_catalogs.append(f"{document.relative_to(REPO_ROOT)}:{line_number}")
    if duplicate_error_catalogs:
        fail(
            "task plans must reference the spec-owned error catalog, found duplicate unions: "
            f"{duplicate_error_catalogs}"
        )

    for relative in REQUIRED_ANCHORS:
        if not (REPO_ROOT / relative).exists():
            fail(f"missing source anchor: {relative}")
    migrations = sorted((REPO_ROOT / "src-tauri/migrations").glob("*.sql"))
    expected_migrations = [f"{number:04d}" for number in range(1, 36)]
    actual_migrations = [path.name.split("_", 1)[0] for path in migrations]
    if actual_migrations != expected_migrations:
        fail(f"expected migrations 0001-0035, found: {actual_migrations}")

    fixture_check = subprocess.run(
        [sys.executable, str(SPEC_ROOT / "cross-layer/fixtures/mono-v1/validate.py")],
        cwd=REPO_ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if fixture_check.returncode:
        fail(f"fixture validator failed:\n{fixture_check.stdout}{fixture_check.stderr}")

    context = subprocess.run(
        [sys.executable, "./.trellis/scripts/get_context.py", "--mode", "packages"],
        cwd=REPO_ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if context.returncode:
        fail(f"get_context packages failed:\n{context.stdout}{context.stderr}")
    for layer in ("backend", "cross-layer", "frontend"):
        if layer not in context.stdout:
            fail(f"get_context packages omitted spec layer: {layer}")

    negative_probes = []
    try:
        ensure_no_duplicate_anchors(
            "## Duplicate Anchor\n\n### duplicate-anchor\n",
            "negative-heading-probe.md",
        )
    except AssertionError:
        negative_probes.append("duplicate-markdown-anchor-cross-level")
    else:
        fail("cross-level duplicate normalized Markdown anchor probe was accepted")
    setext_probe = (
        "Setext H1\n==========\n\nSetext H2\n---------\n\n"
        "## setext h1\n\n### SETEXT-H2\n"
    )
    setext_duplicates = duplicate_markdown_anchors(setext_probe)
    if setext_duplicates != ["setext-h1", "setext-h2"]:
        fail(
            "ATX/Setext normalized duplicate regression probe was accepted: "
            f"{setext_duplicates}"
        )
    negative_probes.append("duplicate-markdown-anchor-atx-setext-h1-h2")
    try:
        ensure_single_manifest_owner([
            definitions[0],
            ".trellis/tasks/negative-probe/design.md:1",
        ])
    except AssertionError:
        negative_probes.append("duplicate-plugin-manifest-owner")
    else:
        fail("duplicate PluginManifestV1 owner negative probe was accepted")

    print(
        f"validated {len(markdown)} spec documents, all local links, "
        f"{len(migrations)} immutable migration anchors"
    )
    print(f"validated negative probes: {', '.join(negative_probes)}")
    print(fixture_check.stdout.strip())
    print(context.stdout.strip())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"spec validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
