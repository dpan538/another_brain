from collections import Counter
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
EVAL = ROOT / "evals" / "r29b2m_daily_dialogue_v2"


def rows():
    return [json.loads(line) for line in (EVAL / "sessions.jsonl").read_text(encoding="utf-8").splitlines() if line]


def test_eval_v2_is_frozen_with_28_balanced_semantic_families():
    sessions = rows()
    manifest = json.loads((EVAL / "manifest.json").read_text(encoding="utf-8"))
    payload = (EVAL / "sessions.jsonl").read_bytes()
    counts = Counter(row["family_id"] for row in sessions)
    assert len(sessions) == 280
    assert len(counts) == 28
    assert set(counts.values()) == {10}
    assert manifest["frozen_before_training_data_generation"] is True
    assert manifest["sessions_sha256"] == hashlib.sha256(payload).hexdigest()


def test_eval_v2_has_real_turn_contract_and_no_exact_targets():
    sessions = rows()
    normalized = []
    for row in sessions:
        assert 2 <= row["turn_count_including_generated_assistant"] <= 6
        assert row["turn_count_including_generated_assistant"] == len(row["messages"]) + 1
        assert row["messages"][-1]["role"] == "user"
        assert all(message["role"] == ("user" if index % 2 == 0 else "assistant") for index, message in enumerate(row["messages"]))
        assert row["split"] == "eval_v2"
        assert "target" not in row
        normalized.append(re.sub(r"[\s，。！？、,.!?；;：:]", "", row["messages"][-1]["content"]).lower())
    assert len(normalized) == len(set(normalized))
