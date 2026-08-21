"""Token-weighted MLX full-fine-tuning loop for R29B2M-R3."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import shutil
from time import perf_counter
from typing import Any

from src.training.mlx.r29b2m_model import load_r28m1_seed
from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now
from src.training.mlx.r29b2m_r3_checkpoint import LoadedCheckpoint, load_checkpoint
from src.training.mlx.r29b2m_r3_loader import AdmittedDataset, LoadedDialogueRow
from src.training.mlx.r29b2m_r3_loss import (
    add_gradient_trees,
    make_loss_and_grad,
    materialize_gradient_tree,
    normalize_and_clip_gradients,
)
from src.training.mlx.r29b2m_r3_optimizer import OPTIMIZER_CONFIG, create_optimizer, mask_sha256, parameter_tree_report
from src.training.mlx.r29b2m_r3_sampler import CAMPAIGN_SEED, ScheduleEntry, build_epoch_schedule, schedule_manifest
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


@dataclass
class TrainingProgress:
    global_optimizer_step: int = 0
    optimizer_tokens: int = 0
    assistant_target_tokens: int = 0
    logical_epoch: int = 0
    schedule_position: int = 0
    accumulation_index: int = 0
    current_train_loss: float | None = None

    @classmethod
    def from_checkpoint(cls, checkpoint: LoadedCheckpoint) -> "TrainingProgress":
        state, cursor = checkpoint.campaign_state, checkpoint.data_cursor
        return cls(
            global_optimizer_step=int(state["global_optimizer_step"]),
            optimizer_tokens=int(state["optimizer_tokens"]),
            assistant_target_tokens=int(state["assistant_target_tokens"]),
            logical_epoch=int(cursor["logical_epoch"]),
            schedule_position=int(cursor["schedule_position"]),
            accumulation_index=int(cursor["accumulation_index"]),
            current_train_loss=state.get("current_train_loss"),
        )

    def state_fields(self) -> dict[str, Any]:
        return {
            "global_optimizer_step": self.global_optimizer_step,
            "optimizer_tokens": self.optimizer_tokens,
            "assistant_target_tokens": self.assistant_target_tokens,
            "logical_epoch": self.logical_epoch,
            "dataset_cursor": self.schedule_position,
            "accumulation_index": self.accumulation_index,
            "current_train_loss": self.current_train_loss,
        }


def _rss_bytes() -> int:
    try:
        import psutil

        return int(psutil.Process().memory_info().rss)
    except Exception:
        return 0


def _tree_all_finite(tree: Any) -> bool:
    import mlx.core as mx
    from mlx.utils import tree_flatten

    checks = [mx.all(mx.isfinite(value)) for _, value in tree_flatten(tree)]
    mx.eval(checks)
    return all(bool(value.item()) for value in checks)


def activate_training_mode(model: Any) -> Any:
    """Normalize seed and resumed models to the same recursive train mode."""
    model.train()
    return model


class R29B2MTrainer:
    def __init__(
        self,
        *,
        model: Any,
        optimizer: Any,
        tokenizer: ExactRuntimeTokenizer,
        dataset: AdmittedDataset,
        artifact_root: Path,
        progress: TrainingProgress | None = None,
    ) -> None:
        self.model = activate_training_mode(model)
        self.optimizer = optimizer
        self.tokenizer = tokenizer
        self.dataset = dataset
        self.artifact_root = artifact_root.resolve()
        self.progress = progress or TrainingProgress()
        if self.progress.accumulation_index != 0:
            raise ValueError("trainer_must_start_at_accumulation_boundary")
        self.encoded_train = dataset.encode_rows(tokenizer, dataset.train)
        self.encoded_by_session = {item.session_id: item for item in self.encoded_train}
        self.loss_and_grad = make_loss_and_grad(self.model)
        self.mask_sha_before = mask_sha256(self.model)
        self.parameter_report = parameter_tree_report(self.model)
        if self.parameter_report["trainable_parameter_count"] != 96_421_248:
            raise ValueError("unexpected_r29b2m_r3_trainable_parameter_count")
        self.metrics_path = self.artifact_root / "logs" / "optimizer_updates.jsonl"
        self.schedule_dir = self.artifact_root / "schedules"
        self.schedule_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_seed(
        cls,
        *,
        seed_path: Path,
        tokenizer: ExactRuntimeTokenizer,
        dataset: AdmittedDataset,
        artifact_root: Path,
    ) -> "R29B2MTrainer":
        import mlx.core as mx

        mx.random.seed(CAMPAIGN_SEED)
        model = load_r28m1_seed(seed_path)
        optimizer = create_optimizer(model)
        mx.eval(model.parameters(), optimizer.state)
        return cls(model=model, optimizer=optimizer, tokenizer=tokenizer, dataset=dataset, artifact_root=artifact_root)

    @classmethod
    def from_checkpoint(
        cls,
        *,
        checkpoint_dir: Path,
        tokenizer: ExactRuntimeTokenizer,
        dataset: AdmittedDataset,
        artifact_root: Path,
    ) -> "R29B2MTrainer":
        loaded = load_checkpoint(checkpoint_dir, restore_rng=True)
        return cls(
            model=loaded.model,
            optimizer=loaded.optimizer,
            tokenizer=tokenizer,
            dataset=dataset,
            artifact_root=artifact_root,
            progress=TrainingProgress.from_checkpoint(loaded),
        )

    def _schedule(self) -> tuple[tuple[ScheduleEntry, ...], dict[str, Any]]:
        entries = build_epoch_schedule(self.dataset.train, epoch=self.progress.logical_epoch)
        manifest = schedule_manifest(entries)
        path = self.schedule_dir / f"epoch_{self.progress.logical_epoch:04d}.json"
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
            if existing.get("schedule_sha256") != manifest["schedule_sha256"]:
                raise ValueError("durable_schedule_manifest_mismatch")
        else:
            atomic_json(path, manifest)
        return entries, manifest

    def cursor_state(self) -> dict[str, Any]:
        entries, manifest = self._schedule()
        if self.progress.schedule_position > len(entries):
            raise ValueError("schedule_position_out_of_range")
        return {
            "logical_epoch": self.progress.logical_epoch,
            "schedule_sha256": manifest["schedule_sha256"],
            "schedule_position": self.progress.schedule_position,
            "accumulation_index": self.progress.accumulation_index,
            "next_session_id": entries[self.progress.schedule_position].session_id if self.progress.schedule_position < len(entries) else None,
        }

    def _append_update(self, value: dict[str, Any]) -> None:
        self.metrics_path.parent.mkdir(parents=True, exist_ok=True)
        with self.metrics_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    def _advance_epoch_if_needed(self, entries: tuple[ScheduleEntry, ...]) -> tuple[tuple[ScheduleEntry, ...], dict[str, Any]]:
        if self.progress.schedule_position < len(entries):
            return entries, schedule_manifest(entries)
        self.progress.logical_epoch += 1
        self.progress.schedule_position = 0
        return self._schedule()

    def train_one_update(self) -> dict[str, Any]:
        import mlx.core as mx

        if self.progress.accumulation_index != 0:
            raise ValueError("partial_accumulation_not_committed")
        entries, manifest = self._schedule()
        entries, manifest = self._advance_epoch_if_needed(entries)
        if len(entries) - self.progress.schedule_position < OPTIMIZER_CONFIG["gradient_accumulation"]:
            # The schedule is much larger than eight, but keep a deterministic
            # full window by beginning the next logical epoch at the boundary.
            self.progress.logical_epoch += 1
            self.progress.schedule_position = 0
            entries, manifest = self._schedule()
        window = entries[self.progress.schedule_position : self.progress.schedule_position + OPTIMIZER_CONFIG["gradient_accumulation"]]
        if len(window) != OPTIMIZER_CONFIG["gradient_accumulation"]:
            raise ValueError("incomplete_gradient_accumulation_window")
        gradient_buffer: Any | None = None
        loss_sum_total = 0.0
        supervised_total = 0
        optimizer_tokens_total = 0
        row_records: list[dict[str, Any]] = []
        started = perf_counter()
        for accumulation_index, entry in enumerate(window, 1):
            encoded_row: LoadedDialogueRow = self.encoded_by_session[entry.session_id]
            loss_sum, gradients = self.loss_and_grad(self.model, encoded_row.encoded)
            mx.eval(loss_sum, gradients)
            loss_value = float(loss_sum.item())
            if not math.isfinite(loss_value) or not _tree_all_finite(gradients):
                raise FloatingPointError(f"non_finite_loss_or_gradient:{entry.session_id}")
            detached = materialize_gradient_tree(gradients)
            gradient_buffer = add_gradient_trees(gradient_buffer, detached)
            supervised = encoded_row.encoded.assistant_target_token_count
            sequence_tokens = len(encoded_row.encoded.label_ids)
            loss_sum_total += loss_value
            supervised_total += supervised
            optimizer_tokens_total += sequence_tokens
            row_records.append({
                "accumulation_index": accumulation_index,
                "epoch": entry.epoch,
                "schedule_position": entry.schedule_position,
                "session_id": entry.session_id,
                "family_id": entry.family_id,
                "quality_tier": entry.quality_tier,
                "supervised_tokens": supervised,
                "optimizer_tokens": sequence_tokens,
                "raw_loss_sum": loss_value,
            })
        if gradient_buffer is None:
            raise AssertionError("gradient_buffer_not_created")
        clipped, norm_before, norm_after = normalize_and_clip_gradients(
            gradient_buffer,
            supervised_total,
            max_norm=OPTIMIZER_CONFIG["gradient_clip_norm"],
        )
        self.optimizer.update(self.model, clipped)
        mx.eval(self.model.parameters(), self.optimizer.state)
        if not _tree_all_finite(self.optimizer.state) or not _tree_all_finite(self.model.trainable_parameters()):
            raise FloatingPointError("non_finite_model_or_optimizer_after_update")
        self.progress.global_optimizer_step += 1
        self.progress.optimizer_tokens += optimizer_tokens_total
        self.progress.assistant_target_tokens += supervised_total
        self.progress.schedule_position += len(window)
        self.progress.accumulation_index = 0
        normalized_loss = loss_sum_total / supervised_total
        self.progress.current_train_loss = normalized_loss
        elapsed = perf_counter() - started
        mask_after = mask_sha256(self.model)
        if mask_after != self.mask_sha_before:
            raise AssertionError("frozen_attention_mask_changed")
        result = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "global_optimizer_step": self.progress.global_optimizer_step,
            "logical_epoch": self.progress.logical_epoch,
            "schedule_sha256": manifest["schedule_sha256"],
            "schedule_position_after": self.progress.schedule_position,
            "rows": row_records,
            "raw_loss_sum": loss_sum_total,
            "supervised_tokens": supervised_total,
            "optimizer_tokens": optimizer_tokens_total,
            "normalized_loss": normalized_loss,
            "gradient_norm_before_clip": norm_before,
            "gradient_norm_after_clip": norm_after,
            "update_elapsed_seconds": elapsed,
            "peak_mlx_memory_bytes": int(mx.get_peak_memory()),
            "process_rss_bytes": _rss_bytes(),
            "free_disk_bytes": shutil.disk_usage(self.artifact_root).free,
            "mask_sha256_before": self.mask_sha_before,
            "mask_sha256_after": mask_after,
        }
        self._append_update(result)
        return result

    def train_until(self, target_assistant_tokens: int, *, maximum_updates: int | None = None) -> list[dict[str, Any]]:
        if target_assistant_tokens <= self.progress.assistant_target_tokens:
            return []
        updates: list[dict[str, Any]] = []
        while self.progress.assistant_target_tokens < target_assistant_tokens:
            if maximum_updates is not None and len(updates) >= maximum_updates:
                break
            updates.append(self.train_one_update())
        return updates

    def campaign_state_snapshot(self, base_state: dict[str, Any]) -> dict[str, Any]:
        import mlx.core as mx

        fields = self.progress.state_fields()
        return base_state | fields | {
            "campaign_id": CAMPAIGN_ID,
            "training_started": self.progress.global_optimizer_step > 0,
            "peak_mlx_memory_bytes": int(mx.get_peak_memory()),
            "process_rss_bytes": _rss_bytes(),
            "free_disk_bytes": shutil.disk_usage(self.artifact_root).free,
            "updated_at": utc_now(),
        }
