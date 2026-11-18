"""LitFolio 宿主桥：宿主传入论文清单与已有划线，EasyRead 按宿主 ID 打开同一篇。

只在 EASYREAD_HOST=litfolio 时启用；未设置时这套路由不存在，界面和原有导入方式照旧。
- GET  /api/host/catalog  列出文献库现状（供宿主同步索引），不做任何页面准备
- POST /api/host/paper    挂接一篇论文（元数据 + 已有划线），返回 {"id": <目录名>}
- POST /api/host/import   宿主把拖进窗口的 PDF 交过来，逐条报告成功与失败
- POST /api/host/config   写入宿主的模型配置（profile 为 null 时关闭 AI，完全本地可用）
- POST /api/host/shutdown 宿主退出时收尾：停掉模型任务，再关服务

宿主模式下文献库位置由宿主决定，PDF 原件留在宿主给的绝对路径上：移动/清理文献库、删除或彻底
删除宿主挂接的论文一律拒绝；普通导入、阅读、笔记、翻译照常可用。
"""
from __future__ import annotations

import re
import threading
from pathlib import Path

from ..app import config
from ..library import host_library, host_mutations
from ..app.i18n import tr
from ..app.log import log
from ..library.store import Workspace

HOST_PROFILE = "litfolio"
HOST_SCRIPT = "/web/js/litfolio-host.js"
# 会改变文献库位置或清理库内文件的写入：文献库归宿主管。
BLOCKED = {"/api/library/move", "/api/library/cleanup", "/api/migrate/scan",
           "/api/migrate/start", "/api/migrate/stop"}


def guard(path: str) -> None:
    """宿主模式下拒绝改变文献库位置或清理库内文件的写入。宿主自己的路由不经过这里。"""
    if host_library.host_mode() and path in BLOCKED:
        raise ValueError(tr("宿主模式下文献库由宿主管理（{path}）", path=path))


def guard_delete(ws: Workspace) -> None:
    """宿主挂接的论文，PDF 原件由宿主保管，这里不能删。"""
    if host_library.host_mode() and host_library.linked(ws):
        raise ValueError(tr("这篇论文的 PDF 由宿主管理，不能在 EasyRead 里删除"))


def guard_trash(app, action: str, name: str) -> None:
    """彻底删除会丢掉宿主挂接论文的笔记，交给宿主决定。"""
    if not host_library.host_mode() or action == "restore":
        return
    trash = Path(app.lib.root) / ".trash"
    entries = [trash / name] if action == "purge" else [p for p in trash.iterdir() if p.is_dir()] if trash.is_dir() else []
    for entry in entries:
        if host_library.linked(Workspace(entry)):
            raise ValueError(tr("回收站里有宿主挂接的论文，不能在 EasyRead 里彻底删除"))


def get(app, path: str):
    """宿主的只读接口；不认识的路径返回 None，交给调用方回 404。"""
    if path == "/api/host/catalog":
        return {"items": host_library.catalog(app.lib)}
    return None


def post(app, path: str, body: dict):
    """宿主路由的写入；不认识的路径返回 None，交给调用方回 404。"""
    if path == "/api/host/paper":
        return {"id": host_library.open_paper(app.lib, body)}
    if path == "/api/host/import":
        return host_library.import_paths(app.lib, body.get("paths"))
    if path == "/api/host/metadata":
        return host_mutations.metadata(app.lib, body)
    if path == "/api/host/tag":
        return host_mutations.tag(app.lib, body)
    if path == "/api/host/delete":
        pid = body.get("id")
        if app.lib.ws(pid) is not None:
            app.jobs.cancel(pid)
            app.lib.trash(pid)
        return {"ok": True}
    if path == "/api/host/config":
        return _config(body)
    if path == "/api/host/shutdown":
        return _shutdown(app)
    return None


def _config(body: dict) -> dict:
    profile = body.get("profile")
    if profile is not None and not isinstance(profile, dict):
        raise ValueError(tr("profile 必须是对象或 null"))
    setter = getattr(config, "set_host_profile", None)
    if setter is None:
        raise ValueError(tr("这个版本没有宿主模型配置接口"))
    setter(profile)
    return {"host": HOST_PROFILE, "ok": True}


def _shutdown(app) -> dict:
    try:
        stopped = app.jobs.stop_model_work()
    except Exception:  # noqa: BLE001
        stopped = 0
        log.exception("停掉模型任务失败")
    threading.Thread(target=app.shutdown, name="host-shutdown", daemon=True).start()
    return {"ok": True, "stopped": stopped}


def inject_script(page: str) -> str:
    """宿主页面保留上游行为，只注入宿主呈现和消息桥。"""
    if HOST_SCRIPT in page or "</body>" not in page:
        return page
    page = page.replace("<title>EasyRead</title>", "<title>LitFolio</title>")
    page = re.sub(r'<a class="brand" href="/">.*?</a>', '<a class="brand" href="/">LitFolio</a>', page, count=1)
    page = page.replace('<link rel="icon" href="/web/favicon.svg">', "")
    page = page.replace("</head>", '<link rel="stylesheet" href="/web/css/litfolio-host.css">\n</head>', 1)
    return page.replace("</body>", f'<script src="{HOST_SCRIPT}"></script>\n</body>', 1)


GET = {"/api/host/catalog"}
POST = {"/api/host/paper", "/api/host/import", "/api/host/metadata", "/api/host/tag",
        "/api/host/delete", "/api/host/config", "/api/host/shutdown"}
