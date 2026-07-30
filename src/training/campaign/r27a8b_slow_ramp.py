from __future__ import annotations


SLOW_RAMP_PLAN = [
    {
        "stage_id": "micro_sanity",
        "stage_index": -1,
        "optimizer_steps": 20,
        "batch_size": 1,
        "learning_rate": 0.00005,
        "checkpoint": False,
        "stop_on": ["nan_loss", "oom_loop"],
    },
    {
        "stage_id": "warmup",
        "stage_index": 0,
        "optimizer_steps": 100,
        "batch_size": 1,
        "learning_rate": 0.000075,
        "checkpoint": False,
        "stop_on": ["nan_loss", "oom_loop"],
    },
    {
        "stage_id": "controlled_segment",
        "stage_index": 1,
        "optimizer_steps": 500,
        "batch_size": 1,
        "learning_rate": 0.0001,
        "checkpoint": False,
        "stop_on": ["nan_loss", "oom_loop"],
    },
]


def slow_ramp_plan() -> list[dict]:
    return [dict(item) for item in SLOW_RAMP_PLAN]


def ramp_passed(results: list[dict]) -> tuple[bool, list[str]]:
    blockers = []
    expected = [item["stage_id"] for item in SLOW_RAMP_PLAN]
    seen = [item.get("stage_id") for item in results]
    if seen != expected:
        blockers.append("slow_ramp_stage_sequence_mismatch")
    for item in results:
        if not item.get("ok"):
            blockers.append(f"{item.get('stage_id', 'unknown')}_failed")
        if item.get("nan_loss"):
            blockers.append(f"{item.get('stage_id', 'unknown')}_nan_loss")
        if item.get("oom_like"):
            blockers.append(f"{item.get('stage_id', 'unknown')}_oom_like")
        if item.get("checkpoint_written"):
            blockers.append(f"{item.get('stage_id', 'unknown')}_unexpected_checkpoint")
        if item.get("train_loss_end") is None:
            blockers.append(f"{item.get('stage_id', 'unknown')}_missing_loss")
    return not blockers, blockers
