"""Atomic, independently verified checkpoint and exact-resume support."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import tempfile
from typing import Any, Callable, Iterable

from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now
from src.training.mlx.r29b2m_r3_optimizer import OPTIMIZER_CONFIG, configure_trainable_tree, create_optimizer


REQUIRED_CHECKPOINT_FILES = (
    "model.safetensors",
    "optimizer.safetensors",
    "rng_state.safetensors",
    "rng_state.json",
    "training_config.json",
    "campaign_state.json",
    "data_cursor.json",
    "metrics.json",
    "lineage.json",
    "checksums.json",
)
CHECKSUMMED_FILES = REQUIRED_CHECKPOINT_FILES[:-1]
POST_CAMPAIGN_HARD_FLOOR_BYTES = 20_000_000_000


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _jsonable_python_rng(value: Any) -> Any:
    if isinstance(value, tuple):
        return {"__tuple__": [_jsonable_python_rng(item) for item in value]}
    if isinstance(value, list):
        return [_jsonable_python_rng(item) for item in value]
    return value


def _restore_python_rng(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"__tuple__"}:
        return tuple(_restore_python_rng(item) for item in value["__tuple__"])
    if isinstance(value, list):
        return [_restore_python_rng(item) for item in value]
    return value


def checkpoint_resource_gate(
    checkpoint_parent: Path,
    *,
    projected_atomic_write_bytes: int,
    hard_floor_bytes: int = POST_CAMPAIGN_HARD_FLOOR_BYTES,
) -> dict[str, Any]:
    if projected_atomic_write_bytes <= 0:
        raise ValueError("invalid_projected_checkpoint_bytes")
    usage = shutil.disk_usage(checkpoint_parent)
    free_after = usage.free - projected_atomic_write_bytes
    report = {
        "checked_at": utc_now(),
        "free_before_bytes": usage.free,
        "projected_atomic_write_bytes": projected_atomic_write_bytes,
        "free_after_atomic_write_bytes": free_after,
        "hard_floor_bytes": hard_floor_bytes,
        "pass": free_after >= hard_floor_bytes,
    }
    if not report["pass"]:
        raise OSError("checkpoint_resource_hard_floor_not_met")
    return report


def verify_checksums(checkpoint_dir: Path) -> dict[str, str]:
    checksums = json.loads((checkpoint_dir / "checksums.json").read_text(encoding="utf-8"))
    if set(checksums.get("files", {})) != set(CHECKSUMMED_FILES):
        raise ValueError("checkpoint_checksum_file_set_mismatch")
    for name, expected in checksums["files"].items():
        path = checkpoint_dir / name
        if not path.is_file() or sha256_file(path) != expected:
            raise ValueError(f"checkpoint_checksum_mismatch:{name}")
    return dict(checksums["files"])


def validate_resume_lineage(lineage: dict[str, Any]) -> None:
    if lineage.get("warm_start") is True or lineage.get("resume_kind") == "warm_start":
        raise ValueError("warm_start_checkpoint_cannot_resume_r29b2m_r3")
    if lineage.get("campaign_id") not in {None, CAMPAIGN_ID}:
        raise ValueError("resume_lineage_campaign_mismatch")


def replay_cursor_from_last_checkpoint(data_cursor: dict[str, Any]) -> dict[str, Any]:
    """Return the last committed boundary; partial gradients are never kept."""
    if int(data_cursor.get("accumulation_index", -1)) != 0:
        raise ValueError("last_checkpoint_contains_partial_accumulation")
    return {
        "logical_epoch": int(data_cursor["logical_epoch"]),
        "schedule_sha256": str(data_cursor["schedule_sha256"]),
        "schedule_position": int(data_cursor["schedule_position"]),
        "accumulation_index": 0,
        "next_session_id": data_cursor.get("next_session_id"),
    }


def verify_checkpoint_contents(checkpoint_dir: Path, *, generation_input_ids: list[int] | None = None) -> dict[str, Any]:
    """Reload model and optimizer in the caller process.

    Campaign saves invoke this function through ``scripts/r29b2m_r3_train.py``
    in a new process; keeping the function public also allows corruption tests.
    """
    import mlx.core as mx
    from mlx.utils import tree_flatten, tree_unflatten

    from src.training.mlx.r29b2m_model import R29B2MDecoder

    checkpoint_dir = checkpoint_dir.resolve()
    for name in REQUIRED_CHECKPOINT_FILES:
        if not (checkpoint_dir / name).is_file():
            raise ValueError(f"checkpoint_required_file_missing:{name}")
    file_hashes = verify_checksums(checkpoint_dir)
    training_config = json.loads((checkpoint_dir / "training_config.json").read_text(encoding="utf-8"))
    campaign_state = json.loads((checkpoint_dir / "campaign_state.json").read_text(encoding="utf-8"))
    cursor = json.loads((checkpoint_dir / "data_cursor.json").read_text(encoding="utf-8"))
    lineage = json.loads((checkpoint_dir / "lineage.json").read_text(encoding="utf-8"))
    validate_resume_lineage(lineage)
    if training_config.get("campaign_id") != CAMPAIGN_ID or campaign_state.get("campaign_id") != CAMPAIGN_ID:
        raise ValueError("checkpoint_campaign_id_mismatch")
    if campaign_state.get("accumulation_index") != 0 or cursor.get("accumulation_index") != 0:
        raise ValueError("checkpoint_not_at_optimizer_boundary")
    model = R29B2MDecoder()
    model_arrays = mx.load(str(checkpoint_dir / "model.safetensors"))
    model.load_weights(list(model_arrays.items()), strict=True)
    model.eval()
    configure_trainable_tree(model)
    optimizer = create_optimizer(model)
    optimizer_arrays = mx.load(str(checkpoint_dir / "optimizer.safetensors"))
    optimizer.state = tree_unflatten(list(optimizer_arrays.items()))
    mx.eval(model.parameters(), optimizer.state)
    expected_trainable = {name for name, _ in tree_flatten(model.trainable_parameters())}
    optimizer_flat = dict(tree_flatten(optimizer.state))
    for name in expected_trainable:
        if f"{name}.m" not in optimizer_flat or f"{name}.v" not in optimizer_flat:
            raise ValueError(f"checkpoint_optimizer_state_missing:{name}")
    generated: list[int] = []
    if generation_input_ids:
        logits, cache = model.prefill(mx.array([generation_input_ids], dtype=mx.int32))
        for _ in range(4):
            token = int(mx.argmax(logits[:, -1, :], axis=-1).item())
            generated.append(token)
            logits, cache = model.incremental(mx.array([[token]], dtype=mx.int32), cache)
    return {
        "valid": True,
        "checkpoint_id": lineage.get("checkpoint_id"),
        "model_sha256": file_hashes["model.safetensors"],
        "optimizer_sha256": file_hashes["optimizer.safetensors"],
        "global_optimizer_step": campaign_state["global_optimizer_step"],
        "optimizer_tokens": campaign_state["optimizer_tokens"],
        "assistant_target_tokens": campaign_state["assistant_target_tokens"],
        "schedule_sha256": cursor["schedule_sha256"],
        "schedule_position": cursor["schedule_position"],
        "generated_greedy_token_ids": generated,
    }


@dataclass
class LoadedCheckpoint:
    model: Any
    optimizer: Any
    campaign_state: dict[str, Any]
    data_cursor: dict[str, Any]
    metrics: dict[str, Any]
    lineage: dict[str, Any]


def load_checkpoint(checkpoint_dir: Path, *, restore_rng: bool = True) -> LoadedCheckpoint:
    import mlx.core as mx
    from mlx.utils import tree_unflatten

    from src.training.mlx.r29b2m_model import R29B2MDecoder

    verify_checksums(checkpoint_dir)
    state = json.loads((checkpoint_dir / "campaign_state.json").read_text(encoding="utf-8"))
    cursor = json.loads((checkpoint_dir / "data_cursor.json").read_text(encoding="utf-8"))
    config = json.loads((checkpoint_dir / "training_config.json").read_text(encoding="utf-8"))
    lineage = json.loads((checkpoint_dir / "lineage.json").read_text(encoding="utf-8"))
    validate_resume_lineage(lineage)
    if config.get("optimizer") != OPTIMIZER_CONFIG:
        raise ValueError("resume_optimizer_config_mismatch")
    if state.get("accumulation_index") != 0 or cursor.get("accumulation_index") != 0:
        raise ValueError("resume_from_partial_accumulation_forbidden")
    model = R29B2MDecoder()
    model.load_weights(list(mx.load(str(checkpoint_dir / "model.safetensors")).items()), strict=True)
    configure_trainable_tree(model)
    optimizer = create_optimizer(model)
    optimizer.state = tree_unflatten(list(mx.load(str(checkpoint_dir / "optimizer.safetensors")).items()))
    if restore_rng:
        restored_mlx = list(mx.load(str(checkpoint_dir / "rng_state.safetensors")).values())
        mx.random.state[:] = restored_mlx
        python_payload = json.loads((checkpoint_dir / "rng_state.json").read_text(encoding="utf-8"))
        random.setstate(_restore_python_rng(python_payload["python_random_state"]))
    mx.eval(model.parameters(), optimizer.state)
    return LoadedCheckpoint(
        model=model,
        optimizer=optimizer,
        campaign_state=state,
        data_cursor=cursor,
        metrics=json.loads((checkpoint_dir / "metrics.json").read_text(encoding="utf-8")),
        lineage=lineage,
    )


class CheckpointManager:
    def __init__(self, root: Path, *, maximum_retained: int = 3) -> None:
        self.root = root.resolve()
        self.maximum_retained = maximum_retained
        if maximum_retained != 3:
            raise ValueError("r29b2m_r3_checkpoint_retention_must_be_three")
        self.root.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        checkpoint_id: str,
        *,
        model: Any,
        optimizer: Any,
        campaign_state: dict[str, Any],
        data_cursor: dict[str, Any],
        metrics: dict[str, Any],
        lineage: dict[str, Any],
        projected_checkpoint_bytes: int,
        verifier_command: list[str] | None,
        generation_input_ids: list[int] | None = None,
        protected_checkpoint_ids: Iterable[str] = (),
    ) -> tuple[Path, dict[str, Any]]:
        import mlx.core as mx
        from mlx.utils import tree_flatten

        if not checkpoint_id or "/" in checkpoint_id or checkpoint_id.startswith("."):
            raise ValueError("invalid_checkpoint_id")
        if int(campaign_state.get("accumulation_index", -1)) != 0 or int(data_cursor.get("accumulation_index", -1)) != 0:
            raise ValueError("checkpoint_requires_accumulation_boundary")
        final = self.root / checkpoint_id
        if final.exists():
            raise FileExistsError(f"checkpoint_already_exists:{checkpoint_id}")
        resource = checkpoint_resource_gate(self.root, projected_atomic_write_bytes=projected_checkpoint_bytes)
        temporary = Path(tempfile.mkdtemp(prefix=f".{checkpoint_id}.tmp-", dir=self.root))
        try:
            all_parameters = dict(tree_flatten(model.parameters()))
            optimizer_state = dict(tree_flatten(optimizer.state))
            mlx_rng = {f"state.{index}": value for index, value in enumerate(mx.random.state)}
            mx.eval(all_parameters, optimizer_state, mlx_rng)
            mx.save_safetensors(str(temporary / "model.safetensors"), all_parameters)
            mx.save_safetensors(str(temporary / "optimizer.safetensors"), optimizer_state)
            mx.save_safetensors(str(temporary / "rng_state.safetensors"), mlx_rng)
            atomic_json(temporary / "rng_state.json", {"python_random_state": _jsonable_python_rng(random.getstate())})
            atomic_json(temporary / "training_config.json", {"campaign_id": CAMPAIGN_ID, "optimizer": OPTIMIZER_CONFIG})
            atomic_json(temporary / "campaign_state.json", campaign_state)
            atomic_json(temporary / "data_cursor.json", data_cursor)
            atomic_json(temporary / "metrics.json", metrics | {"checkpoint_resource_gate": resource})
            model_digest = sha256_file(temporary / "model.safetensors")
            optimizer_digest = sha256_file(temporary / "optimizer.safetensors")
            checkpoint_lineage = lineage | {
                "campaign_id": CAMPAIGN_ID,
                "checkpoint_id": checkpoint_id,
                "created_at": utc_now(),
                "resume_kind": "resume",
                "model_tensor_digest": model_digest,
                "optimizer_state_digest": optimizer_digest,
            }
            atomic_json(temporary / "lineage.json", checkpoint_lineage)
            file_hashes = {name: sha256_file(temporary / name) for name in CHECKSUMMED_FILES}
            atomic_json(temporary / "checksums.json", {"campaign_id": CAMPAIGN_ID, "files": file_hashes})
            for name in REQUIRED_CHECKPOINT_FILES:
                _fsync_file(temporary / name)
            _fsync_directory(temporary)
            if verifier_command is None:
                verification = verify_checkpoint_contents(temporary, generation_input_ids=generation_input_ids)
                verification["independent_process"] = False
            else:
                command = [part.replace("{checkpoint}", str(temporary)) for part in verifier_command]
                result = subprocess.run(command, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    raise RuntimeError(f"independent_checkpoint_verification_failed:{result.returncode}:{result.stdout}:{result.stderr}")
                output = [line for line in result.stdout.splitlines() if line.strip()]
                verification = json.loads(output[-1])
                if verification.get("valid") is not True:
                    raise RuntimeError("independent_checkpoint_verification_invalid")
                verification["independent_process"] = True
            os.replace(temporary, final)
            _fsync_directory(self.root)
            atomic_json(self.root / "latest.json", {"checkpoint_id": checkpoint_id, "path": str(final), "updated_at": utc_now()})
            self.retain(protected_checkpoint_ids={checkpoint_id, *protected_checkpoint_ids})
            return final, verification
        except BaseException:
            if temporary.exists():
                shutil.rmtree(temporary)
            raise

    def retain(self, *, protected_checkpoint_ids: set[str]) -> list[str]:
        checkpoints = sorted(
            (path for path in self.root.iterdir() if path.is_dir() and not path.name.startswith(".")),
            key=lambda path: path.stat().st_mtime,
        )
        removed: list[str] = []
        while len(checkpoints) > self.maximum_retained:
            victim = next((path for path in checkpoints if path.name not in protected_checkpoint_ids), None)
            if victim is None:
                raise RuntimeError("checkpoint_retention_all_entries_protected")
            shutil.rmtree(victim)
            removed.append(victim.name)
            checkpoints.remove(victim)
        return removed
