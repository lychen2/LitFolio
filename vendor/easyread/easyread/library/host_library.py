"""宿主桥的文献库写入：宿主（EASYREAD_HOST=litfolio）的论文 ID 直接当目录名，
PDF 保持原位、经 source_pdf_path 引用，不复制第二份；旧划线、整篇笔记、宿主侧的 PDF 备注
只在首次打开时补进 reader.json。

所有写入都走 store 的 dir_lock + write_json_atomic，reader 的合并规则用 apply_reader_ops，
所以重复打开同一篇不会覆盖用户后来改的内容，也不会产生第二套 ID 或第二份 PDF。
挂接只写 JSON：页图、抽取文字交给阅读页打开时的既有准备流程，不在挂接时提前渲染。"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from ..app.i18n import tr
from ..app.log import log
from .library import Library
from .store import SCHEMA, Workspace, dir_lock, empty_discussion, empty_reader, now_iso, write_json_atomic

HOST_ENV = "EASYREAD_HOST"
HOST_PROFILE = "litfolio"
ID_RE = re.compile(r"[A-Za-z0-9_\-]{4,64}")
COLORS = ("yellow", "green", "blue", "pink")
STATUSES = ("unread", "reading", "done")
# 宿主负责的元数据字段：payload 字段 -> paper.json meta 键
META_FIELDS = (("title", "title_en"), ("year", "year"), ("venue", "venue"),
               ("doi", "doi"), ("arxiv_id", "arxiv"))


def host_mode() -> bool:
    return (os.environ.get(HOST_ENV) or "").strip().lower() == HOST_PROFILE


def linked(ws: Workspace) -> bool:
    """这篇论文的 PDF 在文献库之外，由宿主保管。"""
    return bool(((ws.load("paper") or {}).get("meta") or {}).get("source_pdf_path"))


def open_paper(lib: Library, payload: dict) -> str:
    """按宿主 ID 打开（必要时创建）一篇论文，返回目录名。重复调用保持原有内容。"""
    pid = str(payload.get("id") or "").strip()
    if not ID_RE.fullmatch(pid):
        raise ValueError(tr("宿主论文 ID 必须是 4-64 位字母、数字、下划线或连字符"))
    source = _source_pdf(lib, payload["pdf_path"]) if payload.get("pdf_path") else None
    ws = Workspace(lib.root / pid)
    if ws.paper_path.exists():
        if source is not None:
            _refresh(ws, payload, source)
    else:
        _create(ws, payload, source)
    _import_reader(ws, payload)
    return pid


def _source_pdf(lib: Library, value) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError(tr("宿主没有给出 PDF 路径"))
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise ValueError(tr("PDF 路径必须是绝对路径：{path}", path=raw))
    path = path.resolve()
    if path.is_relative_to(lib.root):
        raise ValueError(tr("PDF 必须在 EasyRead 文献库之外：{path}", path=str(path)))
    if not path.is_file():
        raise ValueError(tr("PDF 不存在或不可读：{path}", path=str(path)))
    try:
        with path.open("rb") as stream:
            if not stream.read(4).startswith(b"%PDF"):
                raise ValueError(tr("不是 PDF 文件：{path}", path=str(path)))
    except OSError:
        raise ValueError(tr("PDF 不存在或不可读：{path}", path=str(path))) from None
    return path


def _stat(source: Path) -> dict:
    info = source.stat()
    return {"mtime_ns": info.st_mtime_ns, "size": info.st_size}


def _digest(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _authors(payload: dict) -> str:
    authors = payload.get("authors") or []
    if isinstance(authors, str):
        authors = [authors]
    if not isinstance(authors, (list, tuple)):
        raise ValueError(tr("authors 必须是字符串数组"))
    return ", ".join(str(a).strip() for a in authors if str(a).strip())


def _meta(payload: dict, source: Path | None) -> dict:
    meta = {
        "title_zh": "",
        "title_en": str(payload.get("title") or "").strip() or (source.stem if source else payload["id"]),
        "authors": _authors(payload),
        "abstract_en": str(payload.get("abstract_text") or "").strip(),
    }
    if source is None:
        meta["source_type"] = "host-reference"
    else:
        meta.update(source=source.name, source_sha256=_digest(source),
                    source_pdf_path=str(source), source_pdf_stat=_stat(source), pdf="source.pdf")
    for field, key in META_FIELDS:
        value = str(payload.get(field) or "").strip()
        if value:
            meta[key] = value
    return meta


def _create(ws: Workspace, payload: dict, source: Path | None) -> None:
    meta = _meta(payload, source)
    status = payload.get("status", "unread")
    if status not in STATUSES:
        raise ValueError(tr("无效的阅读状态"))
    added = (datetime.fromtimestamp(payload["added_at"], timezone.utc).isoformat()
             if payload.get("added_at") is not None else now_iso())
    ws.root.mkdir(parents=True, exist_ok=True)
    with dir_lock(ws.root):
        if ws.paper_path.exists():
            return
        write_json_atomic(ws.discussion_path, empty_discussion())
        write_json_atomic(ws.reader_path, empty_reader())
        write_json_atomic(ws.item_path, {"added": added, "tags": payload.get("tags") or [],
                                       "status": status, "starred": bool(payload.get("starred"))})
        # paper.json 最后写：中途失败留下的目录不会被当成已导入的论文。
        write_json_atomic(ws.paper_path, {
            "schema": SCHEMA, "meta": meta,
            "translation": {"scope": "未开始", "done_pages": [], "note": ""},  # i18n-ok 存进 paper.json
            "glossary": [], "references": [], "blocks": [],
        })


def _refresh(ws: Workspace, payload: dict, source: Path) -> None:
    """已有目录只更新 PDF 链接：书目信息首次挂接时写定，之后由上游界面和翻译维护，
    宿主带来的旧快照不能把它改回去。页图、译文、块、笔记也都不动。"""
    stat = _stat(source)
    with dir_lock(ws.root):
        paper = ws.load("paper") or {}
        meta = paper.setdefault("meta", {})
        if str(meta.get("source_pdf_path") or "") == str(source) and meta.get("source_pdf_stat") == stat:
            return
        digest = _digest(source)
        if meta.get("source_sha256") != digest:
            # PDF 换了：页图、抽取文字、页数都作废，下次打开重新准备；译文和笔记保留。
            meta.pop("pages", None)
            meta.pop("page_count", None)
            meta["source_sha256"] = digest
        meta["source_pdf_path"] = str(source)
        meta.pop("source_type", None)
        meta["source_pdf_stat"] = stat
        meta["pdf"] = "source.pdf"
        write_json_atomic(ws.paper_path, paper)


def _import_reader(ws: Workspace, payload: dict) -> None:
    reader = ws.load("reader") or {}
    if reader.get("host_imported"):
        return
    notes = reader.get("notes") or {}
    at = now_iso()
    ops = []
    for index, raw in enumerate(_highlights(payload)):
        note = _note(raw, index, at)
        if note["id"] in notes:  # 已经导入过（含用户改过、删过的）
            continue
        ops.append({"op": "note", "note": note, "at": at})
    body = str(payload.get("note") or "")
    if body.strip() and not (reader.get("paper_note") or {}).get("body"):
        ops.append({"op": "paper_note", "body": body, "at": at})
    if ops:
        ws.apply_reader_ops(ops, client="litfolio-host")
    pdf_notes = payload.get("pdf_notes")
    if isinstance(pdf_notes, list) and reader.get("host_pdf_notes") != pdf_notes:
        # 宿主侧的 PDF 备注原样保留；阅读页不认识这个键，也不会改写它。
        def keep(data):
            data["host_pdf_notes"] = pdf_notes
        ws.update("reader", keep)
    ws.update("reader", lambda data: data.update(host_imported=True))


def _highlights(payload: dict) -> list:
    highlights = payload.get("highlights") or []
    if not isinstance(highlights, list):
        raise ValueError(tr("highlights 必须是数组"))
    return highlights


def _note_id(raw: dict, page, text: str) -> str:
    legacy = re.sub(r"[^A-Za-z0-9_\-]", "", str(raw.get("id") or ""))[:48]
    if legacy:
        return "lf-" + legacy
    seed = f"{page}\x00{text}".encode("utf-8")
    return "lf-" + hashlib.sha256(seed).hexdigest()[:16]


def _note(raw, index: int, at: str) -> dict:
    """旧划线转成一条未标定的划线笔记：原话、页码、坐标原样留着，不猜块位置。"""
    if not isinstance(raw, dict):
        raise ValueError(tr("第 {n} 条划线的格式不对", n=index + 1))
    text = str(raw.get("text") or "")
    page = raw.get("page")
    note = {
        "id": _note_id(raw, page, text),
        "kind": "highlight",
        "quote": text,
        "body": str(raw.get("note") or ""),
        "created": at,
        "updated": at,
        "unmarked": True,   # 还没和上游的块对上：只列在笔记里，不在正文上画
        "page": page,
        "source": "litfolio",
        "legacy_id": str(raw.get("id") or ""),
    }
    color = str(raw.get("color") or "").strip().lower()
    if color in COLORS:
        note["color"] = color
    elif color:
        note["legacy_color"] = color
    rect = raw.get("rect_json", raw.get("rect"))
    if rect is not None:
        note["rects"] = rect
    return note


def catalog(lib: Library) -> list[dict]:
    """文献库里现有的全部论文，供宿主建自己的索引；只读，不做页图准备、不触发翻译。"""
    items = []
    for ws in lib.all():
        try:
            items.append(_item(ws))
        except (OSError, ValueError, UnicodeError):
            log.exception("读取文献库条目失败 %s", ws.id)
    return items


def _item(ws: Workspace) -> dict:
    paper = ws.load("paper") or {}
    meta = dict(paper.get("meta") or {})
    item = ws.load("item") or {}
    meta.update({k: v for k, v in (item.get("meta_override") or {}).items() if v or k == "doi"})
    status = item.get("status")
    return {
        "id": ws.id,
        "title": meta.get("display_title") or meta.get("title_zh") or meta.get("title_en") or ws.id,
        "authors": _split_authors(meta.get("authors")),
        "year": _int(meta.get("year") or meta.get("date")),
        "venue": _text(meta.get("venue")),
        "doi": _text(meta.get("doi")),
        "arxiv_id": _text(meta.get("arxiv")),
        "abstract_text": _abstract(paper, meta),
        "pdf_path": _pdf_path(ws, meta),
        "status": status if status in STATUSES else "unread",
        "starred": bool(item.get("starred")),
        "tags": [str(t) for t in item.get("tags") or [] if str(t).strip()],
    }


def _pdf_path(ws: Workspace, meta: dict) -> str | None:
    """真实 PDF 的位置：文库外的链接用原路径，网页来源没有 PDF。文件不在了就如实给 null。"""
    if meta.get("source_type") in ("web", "host-reference"):
        return None
    try:
        return str(ws.source_pdf)
    except ValueError:
        return None


def _abstract(paper: dict, meta: dict) -> str | None:
    if meta.get("abstract_en"):
        return str(meta["abstract_en"])
    for block in paper.get("blocks") or []:
        if block.get("role") == "abstract":
            text = block.get("zh") or block.get("en") or ""
            return str(text) or None
    return None


def _split_authors(value) -> list[str]:
    raw = str(value or "")
    if not raw.strip():
        return []
    return [a.strip() for a in re.split(r"[,;，；]", raw) if a.strip()]


def _int(value):
    match = re.search(r"\d{4}", str(value or ""))
    return int(match.group(0)) if match else None


def _text(value):
    text = str(value or "").strip()
    return text or None


def import_paths(lib: Library, paths) -> dict:
    """宿主的系统 PDF 导入复用上游复制导入，文件由本地库保管，打开时再准备页图。"""
    if not isinstance(paths, list) or not paths:
        raise ValueError(tr("paths 必须是非空数组"))
    imported, failed = [], []
    for raw in paths:
        value = str(raw or "").strip()
        try:
            source = _source_pdf(lib, value)
            ws, fresh = lib.import_pdf_path(source)
            imported.append({"path": value, "id": ws.id, "new": fresh})
        except (ValueError, OSError) as exc:
            failed.append({"path": value, "error": str(exc)})
    return {"imported": imported, "failed": failed}
