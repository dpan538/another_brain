#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.distillation.live_teacher_probe import prepare_probe

prompts = [
    "如果证据只能证明A，能不能顺手断言B？",
    "为什么泛泛的客服式回答不适合another_brain？",
    "一个回答什么时候应该挑战问题前提？",
]
rows = [prepare_probe(p) for p in prompts]
out = ROOT / "artifacts/r27a4/distillation/live_teacher_probe_batch.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"ok": True, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"ok": True, "probe_rows": len(rows), "live_teacher_called": False}, indent=2))
