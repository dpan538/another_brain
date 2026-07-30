import json
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
LEDGER_PATH = ROOT / "data/training_registry/r27a5_training_campaign_ledger.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def default_ledger():
    return {
        "campaign_id": "r27a5_sustained_pilot_distillation_v1",
        "phase": "phase_3_engineering_model_lab",
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "browser_admission": False,
        "stages": [],
    }


def load_ledger():
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not LEDGER_PATH.exists():
        LEDGER_PATH.write_text(json.dumps(default_ledger(), ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return json.loads(LEDGER_PATH.read_text(encoding="utf-8"))


def append_stage(stage):
    ledger = load_ledger()
    ledger.setdefault("stages", []).append(stage)
    ledger["updated_at_utc"] = now_utc()
    LEDGER_PATH.write_text(json.dumps(ledger, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return ledger
