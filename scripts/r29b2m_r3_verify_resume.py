#!/usr/bin/env python3
"""Tiny and actual-96M split-run exact-resume verification for R3."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, initial_state, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_checkpoint import CheckpointManager  # noqa: E402
from src.training.mlx.r29b2m_r3_loader import load_admitted_dataset, sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r3_optimizer import OPTIMIZER_CONFIG  # noqa: E402
from src.training.mlx.r29b2m_r3_trainer import R29B2MTrainer  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, wrapper_for_messages  # noqa: E402


def _write(path: Path, value: dict[str, Any]) -> None:
    atomic_json(path, value)


def _run(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"resume_worker_failed:{result.returncode}:{result.stdout}:{result.stderr}")
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1])


def _tiny_model():
    import mlx.core as mx
    import mlx.nn as nn

    class Tiny(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.proj = nn.Linear(4, 3)
            self.proj.weight = mx.arange(12, dtype=mx.float32).reshape(3, 4) / 50.0
            self.proj.bias = mx.array([0.01, -0.02, 0.03], dtype=mx.float32)

        def __call__(self, x):
            return self.proj(x)

    return Tiny()


def _tiny_step(model: Any, optimizer: Any, index: int, value_and_grad: Any) -> float:
    import mlx.core as mx

    x = mx.array([[float((index + offset) % 7) / 7.0 for offset in range(4)]], dtype=mx.float32)
    y = mx.array([[float((index * 2 + offset) % 5) / 5.0 for offset in range(3)]], dtype=mx.float32)
    loss, grads = value_and_grad(model, x, y)
    optimizer.update(model, grads)
    mx.eval(loss, model.parameters(), optimizer.state)
    return float(loss.item())


def tiny_worker(args: argparse.Namespace) -> int:
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten, tree_unflatten

    model = _tiny_model()
    optimizer = optim.AdamW(learning_rate=5e-4, betas=[0.9, 0.999], eps=1e-8, weight_decay=0.01, bias_correction=False)
    optimizer.init(model.trainable_parameters())
    start = 0
    losses: list[float] = []
    if args.tiny_checkpoint:
        checkpoint = args.tiny_checkpoint.resolve()
        model.load_weights(list(mx.load(str(checkpoint / "model.safetensors")).items()), strict=True)
        optimizer.state = tree_unflatten(list(mx.load(str(checkpoint / "optimizer.safetensors")).items()))
        cursor = json.loads((checkpoint / "cursor.json").read_text(encoding="utf-8"))
        start = int(cursor["position"])
        losses = list(cursor["losses"])
    def objective(active, x, y):
        return mx.mean((active(x) - y) ** 2)
    value_and_grad = nn.value_and_grad(model, objective)
    stop = args.tiny_stop
    for index in range(start, stop):
        losses.append(_tiny_step(model, optimizer, index, value_and_grad))
    if args.tiny_save:
        save = args.tiny_save.resolve()
        save.mkdir(parents=True, exist_ok=True)
        mx.save_safetensors(str(save / "model.safetensors"), dict(tree_flatten(model.parameters())))
        mx.save_safetensors(str(save / "optimizer.safetensors"), dict(tree_flatten(optimizer.state)))
        _write(save / "cursor.json", {"position": stop, "optimizer_tokens": stop * 4, "assistant_target_tokens": stop * 3, "losses": losses})
    generated = [int(mx.argmax(model(mx.array([[float((40 + offset) % 7) / 7.0 for offset in range(4)]], dtype=mx.float32)), axis=-1).item())]
    final_model = args.tiny_output.resolve().with_suffix(".safetensors")
    mx.save_safetensors(str(final_model), dict(tree_flatten(model.parameters())))
    result = {
        "losses": losses,
        "position": stop,
        "optimizer_tokens": stop * 4,
        "assistant_target_tokens": stop * 3,
        "generated_greedy_token_ids": generated,
        "model_path": str(final_model),
        "model_sha256": sha256_file(final_model),
    }
    _write(args.tiny_output.resolve(), result)
    print(json.dumps(result, sort_keys=True), flush=True)
    return 0


def _actual_result(trainer: R29B2MTrainer, tokenizer: ExactRuntimeTokenizer, output: Path) -> dict[str, Any]:
    import mlx.core as mx
    from mlx.utils import tree_flatten

    prompt = tokenizer.encode(wrapper_for_messages([{"role": "user", "content": "你好。"}]), max_tokens=256, add_bos=True)
    logits, cache = trainer.model.prefill(mx.array([prompt], dtype=mx.int32))
    generated: list[int] = []
    for _ in range(4):
        token = int(mx.argmax(logits[:, -1, :], axis=-1).item())
        generated.append(token)
        logits, cache = trainer.model.incremental(mx.array([[token]], dtype=mx.int32), cache)
    model_path = output.with_suffix(".safetensors")
    mx.save_safetensors(str(model_path), dict(tree_flatten(trainer.model.parameters())))
    mx.eval(trainer.model.parameters(), trainer.optimizer.state)
    result = {
        "global_optimizer_step": trainer.progress.global_optimizer_step,
        "optimizer_tokens": trainer.progress.optimizer_tokens,
        "assistant_target_tokens": trainer.progress.assistant_target_tokens,
        "logical_epoch": trainer.progress.logical_epoch,
        "schedule_position": trainer.progress.schedule_position,
        "schedule_sha256": trainer.cursor_state()["schedule_sha256"],
        "generated_greedy_token_ids": generated,
        "model_path": str(model_path),
        "model_sha256": sha256_file(model_path),
    }
    _write(output, result)
    print(json.dumps(result, sort_keys=True), flush=True)
    return result


def actual_worker(args: argparse.Namespace) -> int:
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    dataset = load_admitted_dataset(args.dataset_root.resolve())
    worker_root = args.worker_root.resolve()
    if args.actual_checkpoint:
        trainer = R29B2MTrainer.from_checkpoint(checkpoint_dir=args.actual_checkpoint.resolve(), tokenizer=tokenizer, dataset=dataset, artifact_root=worker_root)
    else:
        trainer = R29B2MTrainer.from_seed(seed_path=args.seed.resolve(), tokenizer=tokenizer, dataset=dataset, artifact_root=worker_root)
    while trainer.progress.global_optimizer_step < args.actual_stop_updates:
        trainer.train_one_update()
    if args.actual_save_checkpoint:
        adopted = json.loads(args.adopted_evidence.read_text(encoding="utf-8"))
        state = trainer.campaign_state_snapshot(initial_state(artifact_root=worker_root, source_revision="actual_resume_fixture", parent_seed_sha256=adopted["parent_seed"]["sha256"]))
        state.update({"state": "RESUME_VALIDATION", "active_checkpoint": "actual_resume_step_1"})
        cursor = trainer.cursor_state()
        manager = CheckpointManager(worker_root / "checkpoints")
        input_ids = tokenizer.encode(wrapper_for_messages([{"role": "user", "content": "你好。"}]), max_tokens=256, add_bos=True)
        verifier = [sys.executable, str(ROOT / "scripts" / "r29b2m_r3_train.py"), "--verify-checkpoint", "{checkpoint}", "--generation-input-ids", ",".join(map(str, input_ids))]
        manager.save(
            "actual_resume_step_1",
            model=trainer.model,
            optimizer=trainer.optimizer,
            campaign_state=state,
            data_cursor=cursor,
            metrics={"fixture": "actual_96m_resume", "best_metrics": None, "patience_state": {}, "current_decision": "VERIFY_RESUME"},
            lineage={
                "parent_seed_sha256": adopted["parent_seed"]["sha256"],
                "architecture_fingerprint": adopted["architecture_fingerprint"],
                "tokenizer_sha256": adopted["repository_hashes"]["tokenizer"],
                "dataset_manifest_sha256": dataset.manifest_sha256,
                "eval_v2_manifest_sha256": adopted["repository_hashes"]["eval_v2_manifest"],
                "scenario_schema_sha256": adopted["repository_hashes"]["scenario_schema"],
                "validator_sha256": adopted["repository_hashes"]["validator_source"],
                "optimizer_configuration": OPTIMIZER_CONFIG,
                "created_from_checkpoint_id": None,
                "training_start_kind": "temporary_actual_resume_fixture",
                "warm_start": False,
            },
            projected_checkpoint_bytes=args.projected_checkpoint_bytes,
            verifier_command=verifier,
            generation_input_ids=input_ids,
        )
    _actual_result(trainer, tokenizer, args.actual_output.resolve())
    return 0


def _compare_models(left_path: Path, right_path: Path) -> float:
    import mlx.core as mx

    left, right = mx.load(str(left_path)), mx.load(str(right_path))
    if set(left) != set(right):
        raise ValueError("resume_model_tensor_set_mismatch")
    maximum = mx.array(0.0, dtype=mx.float32)
    for name in sorted(left):
        if name.endswith(".mask"):
            if not bool(mx.all(left[name] == right[name]).item()):
                raise ValueError(f"resume_mask_mismatch:{name}")
            continue
        maximum = mx.maximum(maximum, mx.max(mx.abs(left[name] - right[name])))
    mx.eval(maximum)
    return float(maximum.item())


def orchestrate(args: argparse.Namespace) -> int:
    python = sys.executable
    with tempfile.TemporaryDirectory(prefix="r29b2m_r3_resume_") as directory:
        temporary = Path(directory)
        tiny_cont = temporary / "tiny_cont.json"
        tiny_first = temporary / "tiny_first.json"
        tiny_second = temporary / "tiny_second.json"
        tiny_ckpt = temporary / "tiny_checkpoint"
        _run([python, str(Path(__file__).resolve()), "--tiny-worker", "--tiny-stop", "40", "--tiny-output", str(tiny_cont)])
        _run([python, str(Path(__file__).resolve()), "--tiny-worker", "--tiny-stop", "20", "--tiny-output", str(tiny_first), "--tiny-save", str(tiny_ckpt)])
        _run([python, str(Path(__file__).resolve()), "--tiny-worker", "--tiny-stop", "40", "--tiny-output", str(tiny_second), "--tiny-checkpoint", str(tiny_ckpt)])
        continuous = json.loads(tiny_cont.read_text(encoding="utf-8"))
        resumed = json.loads(tiny_second.read_text(encoding="utf-8"))
        tiny_loss_delta = max(abs(a - b) for a, b in zip(continuous["losses"], resumed["losses"]))
        tiny_parameter_delta = _compare_models(Path(continuous["model_path"]), Path(resumed["model_path"]))
        tiny_pass = (
            len(continuous["losses"]) == len(resumed["losses"]) == 40
            and tiny_loss_delta <= 1e-7
            and tiny_parameter_delta <= 1e-7
            and continuous["optimizer_tokens"] == resumed["optimizer_tokens"]
            and continuous["assistant_target_tokens"] == resumed["assistant_target_tokens"]
            and continuous["position"] == resumed["position"]
            and continuous["generated_greedy_token_ids"] == resumed["generated_greedy_token_ids"]
        )

        actual_cont = temporary / "actual_cont.json"
        actual_first = temporary / "actual_first.json"
        actual_resumed = temporary / "actual_resumed.json"
        actual_cont_root = temporary / "actual_cont_root"
        actual_split_root = temporary / "actual_split_root"
        common = ["--seed", str(args.seed.resolve()), "--tokenizer", str(args.tokenizer.resolve()), "--dataset-root", str(args.dataset_root.resolve()), "--adopted-evidence", str(args.adopted_evidence.resolve()), "--projected-checkpoint-bytes", str(args.projected_checkpoint_bytes)]
        _run([python, str(Path(__file__).resolve()), "--actual-worker", *common, "--worker-root", str(actual_cont_root), "--actual-stop-updates", "2", "--actual-output", str(actual_cont)])
        _run([python, str(Path(__file__).resolve()), "--actual-worker", *common, "--worker-root", str(actual_split_root), "--actual-stop-updates", "1", "--actual-output", str(actual_first), "--actual-save-checkpoint"])
        actual_checkpoint = actual_split_root / "checkpoints" / "actual_resume_step_1"
        _run([python, str(Path(__file__).resolve()), "--actual-worker", *common, "--worker-root", str(actual_split_root), "--actual-stop-updates", "2", "--actual-output", str(actual_resumed), "--actual-checkpoint", str(actual_checkpoint)])
        actual_continuous = json.loads(actual_cont.read_text(encoding="utf-8"))
        actual_split = json.loads(actual_resumed.read_text(encoding="utf-8"))
        actual_delta = _compare_models(Path(actual_continuous["model_path"]), Path(actual_split["model_path"]))
        actual_pass = (
            actual_continuous["global_optimizer_step"] == actual_split["global_optimizer_step"] == 2
            and actual_continuous["optimizer_tokens"] == actual_split["optimizer_tokens"]
            and actual_continuous["assistant_target_tokens"] == actual_split["assistant_target_tokens"]
            and actual_continuous["schedule_position"] == actual_split["schedule_position"]
            and actual_continuous["schedule_sha256"] == actual_split["schedule_sha256"]
            and actual_continuous["generated_greedy_token_ids"] == actual_split["generated_greedy_token_ids"]
            and actual_delta <= 1e-6
        )
        report = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "valid": tiny_pass and actual_pass,
            "tiny_fixture": {
                "continuous_updates": 40,
                "split_updates": [20, 20],
                "new_process_resume": True,
                "maximum_loss_delta": tiny_loss_delta,
                "parameter_max_absolute_delta": tiny_parameter_delta,
                "optimizer_tokens_exact": continuous["optimizer_tokens"] == resumed["optimizer_tokens"],
                "assistant_target_tokens_exact": continuous["assistant_target_tokens"] == resumed["assistant_target_tokens"],
                "schedule_position_exact": continuous["position"] == resumed["position"],
                "greedy_token_ids_exact": continuous["generated_greedy_token_ids"] == resumed["generated_greedy_token_ids"],
                "pass": tiny_pass,
            },
            "actual_96m_fixture": {
                "continuous_updates": 2,
                "split_updates": [1, 1],
                "new_process_resume": True,
                "optimizer_state_restored": True,
                "next_data_row_identical": actual_continuous["schedule_position"] == actual_split["schedule_position"],
                "counters_exact": actual_continuous["optimizer_tokens"] == actual_split["optimizer_tokens"] and actual_continuous["assistant_target_tokens"] == actual_split["assistant_target_tokens"],
                "schedule_sha256_exact": actual_continuous["schedule_sha256"] == actual_split["schedule_sha256"],
                "greedy_token_ids_exact": actual_continuous["generated_greedy_token_ids"] == actual_split["generated_greedy_token_ids"],
                "parameter_max_absolute_delta": actual_delta,
                "metal_tolerance": 1e-6,
                "temporary_cloned_model_state": True,
                "counts_toward_campaign_training_tokens": False,
                "warm_start": False,
                "pass": actual_pass,
            },
            "temporary_directory_deleted_after_report": True,
        }
        atomic_json(args.output.resolve(), report)
    print(json.dumps({"valid": report["valid"], "tiny_parameter_delta": tiny_parameter_delta, "actual_parameter_delta": actual_delta}, sort_keys=True), flush=True)
    return 0 if report["valid"] else 3


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tiny-worker", action="store_true")
    parser.add_argument("--tiny-stop", type=int, default=40)
    parser.add_argument("--tiny-output", type=Path)
    parser.add_argument("--tiny-save", type=Path)
    parser.add_argument("--tiny-checkpoint", type=Path)
    parser.add_argument("--actual-worker", action="store_true")
    parser.add_argument("--worker-root", type=Path)
    parser.add_argument("--actual-stop-updates", type=int)
    parser.add_argument("--actual-output", type=Path)
    parser.add_argument("--actual-save-checkpoint", action="store_true")
    parser.add_argument("--actual-checkpoint", type=Path)
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--tokenizer", type=Path)
    parser.add_argument("--dataset-root", type=Path)
    parser.add_argument("--adopted-evidence", type=Path)
    parser.add_argument("--projected-checkpoint-bytes", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.tiny_worker:
        return tiny_worker(args)
    if args.actual_worker:
        return actual_worker(args)
    required = ("seed", "tokenizer", "dataset_root", "adopted_evidence", "projected_checkpoint_bytes", "output")
    if any(getattr(args, name) is None for name in required):
        parser.error("resume orchestration requires seed/tokenizer/dataset/adopted evidence/checkpoint bytes/output")
    return orchestrate(args)


if __name__ == "__main__":
    raise SystemExit(main())
