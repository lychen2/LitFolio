"""同步目录中的设备占用提醒；它不是跨设备互斥锁。"""
from __future__ import annotations

import os
import socket
import threading
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from ..app.log import log
from .store import now_iso, read_json, write_json_atomic


class LibraryMarker:
    def __init__(self, root: Path):
        self.path = root / ".core-lock.json"
        self.legacy_path = root / ".easyread-lock.json"
        self.host, self.pid = socket.gethostname(), os.getpid()
        self.owner = uuid4().hex
        self.other = {}
        self.stopped = threading.Event()
        self.thread = None

    def _read(self, path: Path):
        try:
            data = read_json(path, {})
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def other_device(self) -> str:
        now = time.time()
        latest = float("-inf")
        for data in (self.other, self._read(self.legacy_path), self._read(self.path)):
            host = data.get("host")
            if not host or host == self.host:
                continue
            try:
                at = datetime.fromisoformat(data.get("at", "")).timestamp()
            except (ValueError, TypeError):
                continue
            if at > latest and -60 <= now - at < 180:
                self.other = data
                latest = at
        return str(self.other["host"]) if latest != float("-inf") else ""

    def refresh(self):
        self.other_device()  # 写自身心跳之前，记下另一台电脑的近期心跳。
        write_json_atomic(self.path, {"host": self.host, "pid": self.pid, "at": now_iso(), "owner": self.owner})

    def start(self):
        def run():
            while not self.stopped.wait(60):
                try:
                    self.refresh()
                except OSError:
                    log.exception("更新文献库设备标记失败")
        try:
            self.refresh()
        except OSError:
            log.exception("写入文献库设备标记失败")
        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def close(self):
        self.stopped.set()
        if self.thread:
            self.thread.join(timeout=2)
        if self._read(self.path).get("owner") == self.owner:
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                log.exception("移除文献库设备标记失败")
