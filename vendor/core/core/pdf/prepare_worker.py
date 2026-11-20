"""Prepare PDF pages in a desktop child process or an embedded host worker."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

OOM_EXIT = 73
RENDER_SCALES = (2.4, 1.2)


def is_memory_error(error):
    return isinstance(error, MemoryError) or (
        isinstance(error, OSError) and
        ((getattr(error, "winerror", 0) or 0) & 0xFFFFFFFF) == 0xE0000008)


def prepare_isolated(root: Path) -> list[dict]:
    """A failed native allocation cannot poison the next queued paper.

    Only derived page/text files are written by the child. User notes and the
    paper metadata remain owned by the parent. Each retry gets a fresh process.
    """
    prefix = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, "-m", "core"]
    package_root = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="core-prepare-") as tmp:
        result = Path(tmp) / "result.json"
        for scale in RENDER_SCALES:
            result.unlink(missing_ok=True)
            completed = subprocess.run(
                prefix + ["--pdf-prepare-worker", str(root.resolve()), str(result), str(scale)],
                cwd=package_root, capture_output=True, encoding="utf-8", errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            data = json.loads(result.read_text(encoding="utf-8")) if result.exists() else {}
            if completed.returncode == 0 and "pages" in data:
                return data["pages"]
            oom = completed.returncode == OOM_EXIT or (completed.returncode & 0xFFFFFFFF) == 0xE0000008
            if not oom:
                raise RuntimeError(data.get("error") or completed.stderr[-800:] or
                                   f"PDF preparation worker exited ({completed.returncode})")
        raise _memory_error()


def prepare_embedded(root: Path) -> list[dict]:
    """Retry with fresh native handles inside the host's background worker."""
    for scale in RENDER_SCALES:
        try:
            return _prepare(root, scale)
        except (MemoryError, OSError) as error:
            if not is_memory_error(error):
                raise
    raise _memory_error()


def _memory_error() -> MemoryError:
    from ..app.i18n import tr
    return MemoryError(tr("PDF 处理内存不足，降低清晰度重试后仍未完成。请关闭占用内存较多的程序后重试。"))


def main(args):
    root, result, scale = Path(args[0]), Path(args[1]), float(args[2])
    try:
        result.write_text(json.dumps({"pages": _prepare(root, scale)}), encoding="utf-8")
    except Exception as error:
        result.write_text(json.dumps({"error": f"{type(error).__name__}: {error}"}), encoding="utf-8")
        return OOM_EXIT if is_memory_error(error) else 1
    return 0


def _prepare(root: Path, scale: float) -> list[dict]:
    from . import pdfwork
    source = root_source(root)
    # Reopen between renders so caches cannot accumulate across scanned pages.
    pages = pdfwork.render_pages(source, root / "pages", scale=scale, reopen=True)
    pdfwork.extract_text(source, root / "extract")
    return pages


def root_source(root):
    from ..library.store import Workspace
    return Workspace(root).source_pdf
