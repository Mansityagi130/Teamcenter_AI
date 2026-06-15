import os
import json
import random
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
MOCK_DIR = BASE_DIR / "mock_data"
SEED_DIR = MOCK_DIR / "_seed"


@dataclass
class DemoConfig:
    demo_mode: bool = False
    latency_ms: int = 50
    error_rate: float = 0.0
    timeout_rate: float = 0.0
    slow_network_ms: int = 0
    expired_session_rate: float = 0.0


# Initialize from ENV
_config = DemoConfig(demo_mode=os.getenv("DEMO_MODE", "false").lower() == "true")


def get_config() -> DemoConfig:
    return _config


def update_config(**kwargs) -> DemoConfig:
    for k, v in kwargs.items():
        if hasattr(_config, k):
            setattr(_config, k, v)
    return _config


def ensure_mock_dirs():
    MOCK_DIR.mkdir(exist_ok=True)
    SEED_DIR.mkdir(exist_ok=True)


def _read_json(name: str) -> Any:
    ensure_mock_dirs()
    p = MOCK_DIR / name
    if not p.exists():
        # If seed exists, copy seed to file
        seed = SEED_DIR / name
        if seed.exists():
            with open(seed, "r", encoding="utf-8") as f:
                data = json.load(f)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(name: str, data: Any) -> None:
    ensure_mock_dirs()
    p = MOCK_DIR / name
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def reset_mock_data() -> None:
    ensure_mock_dirs()
    for seed_file in SEED_DIR.glob("*.json"):
        tgt = MOCK_DIR / seed_file.name
        with open(seed_file, "r", encoding="utf-8") as sf:
            data = json.load(sf)
        with open(tgt, "w", encoding="utf-8") as tf:
            json.dump(data, tf, indent=2)


def simulate_behavior():
    cfg = get_config()
    # slow network
    if cfg.slow_network_ms and cfg.slow_network_ms > 0:
        time.sleep(cfg.slow_network_ms / 1000.0)

    # overall latency
    if cfg.latency_ms and cfg.latency_ms > 0:
        time.sleep(cfg.latency_ms / 1000.0)

    # expired session
    if cfg.expired_session_rate and random.random() < cfg.expired_session_rate:
        return {"status": "error", "code": 401, "message": "Demo: session expired"}, True

    # timeout
    if cfg.timeout_rate and random.random() < cfg.timeout_rate:
        # Indicate timeout by returning None and a special flag
        return {"status": "error", "code": 504, "message": "Demo: timeout"}, True

    # error
    if cfg.error_rate and random.random() < cfg.error_rate:
        return {"status": "error", "code": 500, "message": "Demo: simulated error"}, True

    return None, False


def demo_match_response(method: str, path: str, json_payload: Optional[Dict[str, Any]] = None) -> Any:
    """Return a mock response for recognized Teamcenter endpoints."""
    # Simulate behavior (latency, errors)
    err_resp, triggered = simulate_behavior()
    if triggered:
        return err_resp

    # Basic routing heuristics
    p = path.lower()
    if p.startswith("/item/search") or p.startswith("/search/item-id") or "/item" in p:
        # Items collection
        items = _read_json("items.json")
        # Search by item_id in payload or query string
        q = None
        if json_payload:
            q = json_payload.get("item_id") or json_payload.get("query")
        elif "query=" in path:
            parsed = parse_qs(urlparse(path).query)
            q = parsed.get("query", [None])[0]

        if p.startswith("/item/add") or p.endswith("/item/add") or "/item/add" in p:
            # create item
            item_id = (json_payload or {}).get("item_id")
            if not item_id:
                return {"status": "error", "message": "item_id required"}
            new_item = {
                "item_id": item_id,
                "item_name": (json_payload or {}).get("item_name", "Demo Item"),
                "item_description": (json_payload or {}).get("item_description", ""),
                "revision_id": (json_payload or {}).get("revision_id", "A"),
                "createdAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            items.append(new_item)
            _write_json("items.json", items)
            return {"status": "success", "item": new_item}

        if p.startswith("/search/item-id") or (q and isinstance(q, str)):
            qstr = str(q or "").lower()
            for it in items:
                if it.get("item_id", "").lower() == qstr:
                    return {"status": "success", "item": it}
            return {"status": "error", "message": "not found", "code": 404}

        # generic list
        return {"status": "success", "items": items}

    if "/workflow" in p:
        workflows = _read_json("workflows.json")
        if p.endswith("/list") or "/workflow/list" in p:
            # optional filter
            if json_payload and json_payload.get("item_id"):
                filtered = [w for w in workflows if w.get("item_id") == json_payload.get("item_id")]
                return {"status": "success", "workflows": filtered}
            return {"status": "success", "workflows": workflows}

    if "/dataset" in p:
        datasets = _read_json("datasets.json")
        if p.startswith("/dataset/download"):
            did = p.split("/")[-1]
            for ds in datasets:
                if str(ds.get("dataset_id","")).lower() == did.lower():
                    return {"status": "success", "dataset_id": ds.get("dataset_id"), "content": ds.get("content", "Demo content")}
            return {"status": "error", "message": "dataset not found", "code": 404}
        # list
        return {"status": "success", "datasets": datasets}

    if "/bom" in p:
        bom = _read_json("bom.json")
        if "/bom/get" in p or p.endswith("/bom/get"):
            iid = (json_payload or {}).get("item_id")
            for b in bom:
                if b.get("item_id") == iid:
                    return {"status": "success", "bom": b}
            return {"status": "error", "message": "bom not found", "code": 404}
        if "/bom/expand" in p or p.endswith("/bom/expand"):
            # return full bom structure
            return {"status": "success", "expanded": bom}

    if "/user" in p or "/users" in p:
        users = _read_json("users.json")
        # lookup by username
        if "/user/profile" in p:
            # return first demo user
            return {"status": "success", "profile": users[0] if users else {}}
        parts = p.split("/")
        if parts and len(parts) > 2 and parts[-1]:
            uname = parts[-1]
            for u in users:
                if u.get("username") == uname:
                    return {"status": "success", "user": u}
        return {"status": "success", "users": users}

    # default fallback
    return {"status": "success", "message": "demo endpoint hit", "path": path}
