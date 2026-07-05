#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.distillation.candidate_queue import write_jsonl
from src.training.distillation.public_instruction_import import candidate_from_public_row

ART = ROOT / "artifacts/r27a4"


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").split("\n") if line.strip()] if Path(path).exists() else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="oasst1,baai_coig,coig_cqia,infinity_instruct")
    ap.add_argument("--max-candidates", type=int, default=5000)
    args = ap.parse_args()
    candidates = []
    blocked = []
    for source in [s.strip() for s in args.sources.split(",") if s.strip()]:
        rows = read_jsonl(ART / "raw_public_samples" / source / "raw.jsonl")
        if not rows:
            blocked.append(source)
            continue
        for row in rows:
            candidate = candidate_from_public_row(row, len(candidates))
            if candidate["prompt"] and candidate["final_answer"]:
                candidates.append(candidate)
            if len(candidates) >= args.max_candidates:
                break
    write_jsonl(ART / "distillation/candidate_queue.jsonl", candidates)
    report = {"ok": True, "candidate_rows": len(candidates), "blocked_sources": blocked, "live_teacher_probe_status": "disabled_by_default"}
    (ART / "reports").mkdir(parents=True, exist_ok=True)
    (ART / "reports/instruction_import_report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A4_DISTILLATION_WORKFLOW.md").write_text("# R27A4 Distillation Workflow\n\nPublic instruction rows enter an ignored candidate queue first. Candidates are pending by default and require filters before engineering promotion. Live teacher probes are disabled by default and require both `--execute-live-teacher` and `R27A4_ALLOW_LIVE_TEACHER=1`.\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
