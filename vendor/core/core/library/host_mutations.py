"""宿主显式修改；与首次挂接的旧快照分开，所有工作区写入仍由 Python 持锁完成。"""
from __future__ import annotations

from .host_library import META_FIELDS, _authors
from .library import Library
from .store import dir_lock, now_iso, write_json_atomic


def metadata(lib: Library, body: dict) -> dict:
    ws = lib.ws(body.get("id"))
    if ws is None:
        raise ValueError("paper not found")
    fields = {key: str(body.get(field) or "").strip() for field, key in META_FIELDS}
    fields["authors"] = _authors(body)
    fields["abstract_en"] = str(body.get("abstract_text") or "").strip()
    if not fields["title_en"]:
        raise ValueError("title is required")
    with dir_lock(ws.root):
        paper = ws.load("paper")
        paper.setdefault("meta", {}).update(fields)
        item = ws.load("item")
        overrides = item.setdefault("meta_override", {})
        overrides.update(fields)
        overrides["display_title"] = fields["title_en"]
        item["updated"] = now_iso()
        write_json_atomic(ws.paper_path, paper)
        write_json_atomic(ws.item_path, item)
    return {"ok": True}


def tag(lib: Library, body: dict) -> dict:
    action = body.get("action")
    name = body.get("name")
    if action not in ("attach", "detach", "rename", "delete") or not isinstance(name, str) or not name.strip():
        raise ValueError("invalid tag action or name")
    replacement = body.get("new_name")
    if action == "rename" and (not isinstance(replacement, str) or not replacement.strip()):
        raise ValueError("new_name is required")
    if action in ("attach", "detach"):
        ws = lib.ws(body.get("id"))
        if ws is None:
            raise ValueError("paper not found")
        workspaces = [ws]
    else:
        workspaces = lib.all()

    def apply(item):
        tags = item.get("tags") or []
        if action == "attach":
            updated = list(dict.fromkeys([*tags, name]))
        else:
            updated = list(dict.fromkeys(replacement if value == name else value
                                         for value in tags if value != name or action == "rename"))
        if updated != tags:
            item["tags"] = updated
            item["updated"] = now_iso()

    for ws in workspaces:
        ws.update("item", apply)
    return {"ok": True}
