import json
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
LEDGER_PATH = ROOT / "data/training_registry/r27a4_training_campaign_ledger.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_ledger(path=LEDGER_PATH):
    path = Path(path)
    if not path.exists():
        return {"campaign_id": "r27a4_long_run_training_campaign_v1", "entries": [], "ok": True}
    return json.loads(path.read_text(encoding="utf-8"))


def write_ledger(ledger, path=LEDGER_PATH):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def append_stage(entry, path=LEDGER_PATH):
    ledger = read_ledger(path)
    ledger.setdefault("created_at_utc", now_utc())
    ledger.setdefault("entries", []).append(entry)
    ledger["updated_at_utc"] = now_utc()
    write_ledger(ledger, path)
    return ledger


def totals(ledger):
    entries = ledger.get("entries", [])
    return {
        "steps": sum(int(e.get("steps") or 0) for e in entries),
        "train_tokens": sum(int(e.get("train_tokens") or 0) for e in entries),
        "checkpoints": len([e for e in entries if e.get("checkpoint_path")]),
    }


def active_approval_count(marker):
    if not marker.get("approved"):
        return 0
    if marker.get("consumed") is True:
        return 0
    return 1 if marker.get("allow_engineering_training") or marker.get("allow_decoder_training") else 0
