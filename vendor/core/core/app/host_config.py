"""Host-owned model profile.

LitFolio runs this backend as a sidecar, keeps the reading-model API key in the
OS keyring and pushes the active model here over an authenticated loopback
POST. `LITFOLIO_CORE_HOST=litfolio` marks that mode, owns the OpenAI-compatible
endpoint for the running process and keeps every credential in memory only:
LitFolio's own non-secret settings and local CLI engines stay the user's.

Normalized profile (all fields optional except `base_url` and `model`):
    base_url          http(s) endpoint root, trailing "/" removed
    api_key           bearer token, never written to disk
    model             chat model id
    api               "chat" (default) or "responses"
    vision            model accepts image input
    temperature       0–2, omitted when absent
    max_tokens        positive completion/output ceiling, omitted when absent
    thinking_format   auto | thinking | enable_thinking | chat_template |
                      reasoning_effort | omit
    thinking_mode     auto | enabled | disabled
    reasoning_effort  auto | low | medium | high
"""
from __future__ import annotations

import os
import threading
from urllib.parse import urlsplit

from .. import __version__

HOST_ENV = "LITFOLIO_CORE_HOST"
HOST_VALUE = "litfolio"
HOSTED = (os.environ.get(HOST_ENV) or "").strip().lower() == HOST_VALUE
AI_USER_AGENT = "LitFolio" if HOSTED else f"LitFolio/{__version__}"
AI_REQUEST_PREFIX = "core"

API_KINDS = ("chat", "responses")
THINKING_FORMATS = ("auto", "thinking", "enable_thinking", "chat_template", "reasoning_effort", "omit")
THINKING_MODES = ("auto", "enabled", "disabled")
EFFORTS = ("auto", "low", "medium", "high")
PROFILE_FIELDS = ("base_url", "api_key", "model", "api", "vision", "temperature", "max_tokens",
                  "thinking_format", "thinking_mode", "reasoning_effort")
SECRET_FIELDS = ("api_key", "keys")
DERIVED_FIELDS = SECRET_FIELDS + ("host_request", "has_key", "saved_keys")  # 页面/进程内的状态，不写进 config.json
REQUEST_FIELDS = ("temperature", "max_tokens", "thinking_format", "thinking_mode", "reasoning_effort")
# Same sentence reaches the settings page and the host log when a secret is refused.
NO_SECRET_SAVE = (
    "The LitFolio host keeps this model API key in the OS keyring, so the reading core cannot store one. "
    "Change the key in the app's model settings; The reading core still saves every non-secret option."
)


def strip_secrets(node):
    """Remove credentials and host-derived state from a settings tree before it reaches disk."""
    if isinstance(node, dict):
        for key in DERIVED_FIELDS:
            node.pop(key, None)
        for value in node.values():
            strip_secrets(value)
    elif isinstance(node, list):
        for value in node:
            strip_secrets(value)
    return node


def effective(section: dict) -> dict:
    """OpenAI section a request must use: in hosted mode the host's endpoint, key and model win."""
    return merge(section) if HOSTED and has_profile() else section


def resolved(options: dict, task: str = "") -> tuple[str, bool | None, str | None]:
    """(format, thinking enabled, reasoning effort) for a request, filling `auto` from the endpoint.

    Mirrors src-tauri/src/ai/client/request.rs so a hosted call sends the same
    explicit switch LitFolio's own AI calls send. Explicit values always win.
    Translation turns thinking off in auto mode: reasoning tokens that eat the
    output budget leave the translation empty.
    """
    base = (options.get("base_url") or "").lower()
    model = (options.get("model") or "").lower()
    host = urlsplit(base).hostname or ""
    fmt = (options.get("thinking_format") or "auto").lower()
    if fmt == "auto":
        if host == "api.deepseek.com" and model.startswith("deepseek-"):
            fmt = "thinking"
        elif host in ("api.moonshot.cn", "api.moonshot.ai") and model.startswith(("kimi-k2.5", "kimi-k2.6")):
            fmt = "thinking"
        elif host in ("api.siliconflow.cn", "api.siliconflow.com"):
            fmt = "enable_thinking"
        elif (host == "api.openai.com" and uses_completion_tokens(model)) or urlsplit(base).port == 11434:
            fmt = "reasoning_effort"
        else:
            fmt = "omit"
    mode = (options.get("thinking_mode") or "auto").lower()
    effort = (options.get("reasoning_effort") or "auto").lower()
    enabled = {"enabled": True, "disabled": False}.get(mode)
    if enabled is None and mode == "auto":
        if effort != "auto":
            enabled = True  # 选了推理档位就是要开
        elif task == "translate" or not _reasoning_model(model):
            enabled = False if fmt != "omit" else None
    return fmt, enabled, (None if effort == "auto" else effort)


def uses_completion_tokens(model: str) -> bool:
    """GPT-5 / o-series answer with `max_completion_tokens` and ignore `max_tokens`."""
    return (model or "").lower().startswith(("gpt-5", "o1", "o3", "o4"))


def cannot_disable_reasoning(model: str) -> bool:
    """o-series, GPT-OSS and GPT-5 before 5.1 always reason, so `none` would be rejected."""
    model = (model or "").lower()
    return (model.startswith(("o1", "o3", "o4", "gpt-oss"))
            or (model.startswith("gpt-5") and not model.startswith("gpt-5.")))


def _reasoning_model(model: str) -> bool:
    return (model.startswith(("gpt-5", "gpt-oss", "o1", "o3", "o4")) or "r1" in model
            or "reasoner" in model or "deep-think" in model or "thinking" in model)


_lock = threading.Lock()
_profile: dict | None = None


def hosted() -> bool:
    return HOSTED


def has_profile() -> bool:
    with _lock:
        return _profile is not None


def profile() -> dict | None:
    """Effective request options for this process, or None before the host pushes one."""
    with _lock:
        return dict(_profile) if _profile is not None else None


def public_profile() -> dict:
    """Profile as the page and the host may see it: never the key itself."""
    p = profile()
    if p is None:
        return {"configured": False}
    out = {k: p[k] for k in PROFILE_FIELDS if k not in SECRET_FIELDS}
    out["has_key"] = bool(p.get("api_key"))
    out["configured"] = True
    return out


def merge(openai: dict) -> dict:
    """OpenAI section for this process: the host's endpoint, key and model replace the saved ones.

    Derived request options travel under `host_request` so LitFolio's own card
    keys keep their upstream meaning. `api_key` stays present (empty without a
    profile) because the key table and the header builder index it directly.
    """
    section = {k: v for k, v in (openai or {}).items() if k not in DERIVED_FIELDS}
    section["api_key"] = ""
    p = profile()
    if p is None:
        return section
    section.pop("reasoning_effort", None)  # 宿主档案里的档位说了算，不混用旧卡片的
    section.update(base_url=p["base_url"], api_key=p["api_key"], model=p["model"],
                   api=p["api"], vision=p["vision"])
    section["preset"] = ""  # 宿主给的是自己的地址，不套用内置预设的地址和 Key
    section["host_request"] = {k: p[k] for k in REQUEST_FIELDS}
    return section


def refuse_new_secret(value) -> None:
    """Raise when a page hands us a key that is neither blank, masked, nor the host's own."""
    if isinstance(value, str) and _new_secret(value, (profile() or {}).get("api_key") or ""):
        raise ValueError(NO_SECRET_SAVE)


def prepare_save(patch: dict) -> None:
    """Let a hosted save through only when it carries no new secret.

    The page echoes the effective key back inside `api_key` / `keys`; those
    entries are dropped so nothing is written, while a new plaintext key is
    refused with the message the settings page shows.
    """
    _walk_secrets(patch)


def _walk_secrets(node) -> None:
    host_key = (profile() or {}).get("api_key") or ""
    if isinstance(node, dict):
        _drop_secret(node, "api_key", host_key)
        _drop_secret(node, "keys", host_key)
        for value in node.values():
            _walk_secrets(value)
    elif isinstance(node, list):
        for value in node:
            _walk_secrets(value)


def _drop_secret(node: dict, field: str, host_key: str) -> None:
    value = node.get(field)
    if isinstance(value, str):
        if _new_secret(value, host_key):
            raise ValueError(NO_SECRET_SAVE)
        node.pop(field)
    elif isinstance(value, dict) and field == "keys":
        if any(_new_secret(v, host_key) for v in value.values() if isinstance(v, str)):
            raise ValueError(NO_SECRET_SAVE)
        node.pop(field)


def _new_secret(value: str, host_key: str) -> bool:
    value = value.strip()
    return bool(value) and not value.startswith("••••") and value != host_key


def has_secrets(node) -> bool:
    """True when a settings tree still holds a key, wherever it sits."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in SECRET_FIELDS:
                if isinstance(value, str) and value.strip() and not value.startswith("••••"):
                    return True
                if isinstance(value, dict) and any(
                        isinstance(v, str) and v.strip() and not v.startswith("••••") for v in value.values()):
                    return True
            if has_secrets(value):
                return True
    elif isinstance(node, list):
        return any(has_secrets(value) for value in node)
    return False


def set_profile(raw) -> dict:
    """Normalize and install the host profile; {} or {"clear": true} clears it."""
    global _profile
    normalized = normalize(raw)
    with _lock:
        _profile = normalized
    return public_profile()


def clear_profile() -> dict:
    global _profile
    with _lock:
        _profile = None
    return public_profile()


def normalize(raw) -> dict | None:
    if raw is None or raw == {} or raw == {"clear": True}:
        return None
    if not isinstance(raw, dict):
        raise ValueError("host profile must be a JSON object")
    unknown = sorted(set(raw) - set(PROFILE_FIELDS) - {"clear"})
    if unknown:
        raise ValueError("unsupported host profile fields: " + ", ".join(unknown)
                         + "; accepted fields: " + ", ".join(PROFILE_FIELDS))
    out = {
        "base_url": _url(raw.get("base_url")),
        "api_key": _text(raw.get("api_key"), "api_key", limit=8000),
        "model": _text(raw.get("model"), "model", limit=300),
        "api": _choice(raw.get("api", "chat"), "api", API_KINDS),
        "vision": _flag(raw.get("vision", False), "vision"),
        "temperature": _temperature(raw.get("temperature")),
        "max_tokens": _max_tokens(raw.get("max_tokens")),
        "thinking_format": _choice(raw.get("thinking_format", "auto"), "thinking_format", THINKING_FORMATS),
        "thinking_mode": _choice(raw.get("thinking_mode", "auto"), "thinking_mode", THINKING_MODES),
        "reasoning_effort": _choice(raw.get("reasoning_effort", "auto"), "reasoning_effort", EFFORTS),
    }
    if not out["model"]:
        raise ValueError("host profile needs a model")
    return out


def _text(value, name: str, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"host profile field {name} must be a string")
    value = value.strip()
    if len(value) > limit:
        raise ValueError(f"host profile field {name} is too long")
    return value


def _url(value) -> str:
    base = _text(value, "base_url", limit=600).rstrip("/")
    if not base:
        raise ValueError("host profile needs a base_url")
    parsed = urlsplit(base)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("host profile base_url must be an HTTP or HTTPS address without credentials")
    return base


def _flag(value, name: str) -> bool:
    if type(value) is not bool:
        raise ValueError(f"host profile field {name} must be a boolean")
    return value


def _temperature(value):
    if value is None:
        return None
    if type(value) is bool or not isinstance(value, (int, float)):
        raise ValueError("host profile field temperature must be a number")
    if not 0 <= float(value) <= 2:
        raise ValueError("host profile field temperature must be between 0 and 2")
    return float(value)


def _max_tokens(value):
    if value is None:
        return None
    if type(value) is bool or not isinstance(value, int):
        raise ValueError("host profile field max_tokens must be an integer")
    if not 1 <= value <= 1_000_000:
        raise ValueError("host profile field max_tokens must be between 1 and 1000000")
    return value


def _choice(value, name: str, allowed: tuple[str, ...]) -> str:
    if not isinstance(value, str) or value.strip().lower() not in allowed:
        raise ValueError(f"host profile field {name} must be one of: " + ", ".join(allowed))
    return value.strip().lower()
