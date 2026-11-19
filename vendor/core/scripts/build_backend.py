"""Freeze the LitFolio service into the single executable Tauri ships as a sidecar."""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "backend"
WORK = ROOT / "build" / "pyinstaller"
NAME = "core-backend"
REQUIRED = ("core", "pypdfium2", "pypdfium2_raw", "pdfplumber", "PIL", "pypdf", "truststore", "certifi", "bs4")


def python_with_pyinstaller() -> list[str]:
    candidates: list[str] = []
    configured = os.environ.get("PYTHON")
    if configured:
        candidates.append(configured)
    venv = ROOT / (".venv\\Scripts\\python.exe" if os.name == "nt" else ".venv/bin/python")
    if venv.exists():
        candidates.append(str(venv))
    candidates.append(sys.executable)
    for candidate in candidates:
        probe = subprocess.run([candidate, "-c", "import PyInstaller"], cwd=ROOT, capture_output=True)
        if probe.returncode == 0:
            return [candidate]
    raise SystemExit("未找到 PyInstaller。请运行：python -m pip install pyinstaller .")


def check_dependencies(python: list[str]) -> None:
    for module in REQUIRED:
        probe = subprocess.run(python + ["-c", f"import {module}"], cwd=ROOT, capture_output=True)
        if probe.returncode:
            raise SystemExit(f"无法加载后端依赖 {module}。请使用打包的 Python 安装：python -m pip install pyinstaller .")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    python = python_with_pyinstaller()
    check_dependencies(python)
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():
        if old.is_file() or old.is_symlink():
            old.unlink()
        elif old.is_dir():
            shutil.rmtree(old)
    # Onefile on every platform: Tauri externalBin installs the executable alone,
    # so a --onedir bootloader would lose its sibling _internal directory.
    cmd = python + ["-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
                    "--name", NAME, "--distpath", str(OUT),
                    "--workpath", str(WORK), "--specpath", str(WORK),
                    *[arg for module in REQUIRED for arg in ("--collect-all", module)],
                    str(ROOT / "scripts" / "backend_entry.py")]
    subprocess.run(cmd, cwd=ROOT, check=True)
    artifact = OUT / (f"{NAME}.exe" if os.name == "nt" else NAME)
    if not artifact.is_file():
        raise SystemExit(f"PyInstaller 未生成预期产物：{artifact}")
    # PyInstaller usually marks the output executable; make the contract explicit
    # because Tauri copies the file as-is into the installer.
    if os.name != "nt":
        artifact.chmod(artifact.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"后端已生成：{artifact}（{artifact.stat().st_size / 2**20:.1f} MiB）")


if __name__ == "__main__":
    main()
