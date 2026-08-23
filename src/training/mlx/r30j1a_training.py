"""Foreground-only training, evaluation, and checkpoint contracts for R30J1A."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import tempfile
from time import perf_counter
from typing import Any, Callable, Iterable, Mapping, Sequence

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten, tree_map, tree_unflatten

from src.training.mlx.r29b2m_r3_loss import add_gradient_trees, gradient_global_norm, materialize_gradient_tree
from src.training.mlx.r30j1a_contract import (
    CAMPAIGN_ID,
    DOMAIN_LABELS,
    MECHANICS_LABELS,
    encode_dialogue_unit,
)
from src.training.mlx.r30j1a_model import (
    EfishPersonalJudgeJ1A,
    architecture_sha256,
    configure_trainable_scope,
    load_lineage_weights,
    parameter_report,
    sha256_file,
)
from src.training.mlx.r30j1a_supervision import parse_memory_pressure, parse_swap_usage, validate_resource_snapshot


TRAINING_SEED = 3_001_101
DEFAULT_LOSS_WEIGHTS = {
    "domain": 0.25,
    "register": 0.25,
    "mechanics": 0.25,
    "contrastive": 0.25,
}
OPTIMIZER_CONFIG = {
    "name": "AdamW",
    "learning_rate": 3e-5,
    "betas": [0.9, 0.999],
    "epsilon": 1e-8,
    "weight_decay": 0.01,
    "gradient_clip_norm": 1.0,
    "microbatch": 1,
    "gradient_accumulation": 4,
    "dropout": 0.0,
    "proxy_temperature": 0.12,
    "scheduler": "constant",
}
CHECKPOINT_FILES = (
    "model.safetensors",
    "optimizer.safetensors",
    "mlx_rng.safetensors",
    "python_rng.json",
    "training_state.json",
    "scheduler_state.json",
    "architecture.json",
    "lineage.json",
    "metrics.json",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path: Path, value: Any) -> None:
    atomic_text(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def append_jsonl(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(dict(value), ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def json_sha256(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _jsonable_rng(value: Any) -> Any:
    if isinstance(value, tuple):
        return {"__tuple__": [_jsonable_rng(item) for item in value]}
    if isinstance(value, list):
        return [_jsonable_rng(item) for item in value]
    return value


def _restore_rng(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"__tuple__"}:
        return tuple(_restore_rng(item) for item in value["__tuple__"])
    if isinstance(value, list):
        return [_restore_rng(item) for item in value]
    return value


@dataclass(frozen=True)
class DatasetBundle:
    root: Path
    manifest: dict[str, Any]
    train: tuple[dict[str, Any], ...]
    dev: tuple[dict[str, Any], ...]
    heldout: tuple[dict[str, Any], ...] | None
    register_labels: tuple[str, ...]
    manifest_sha256: str


def load_dataset(root: Path, *, open_heldout: bool = False) -> DatasetBundle:
    root = root.resolve()
    manifest_path = root / "dataset_manifest.json"
    manifest = read_json(manifest_path)
    if manifest.get("campaign_id") != CAMPAIGN_ID or manifest.get("allowed_for_training") is not True:
        raise ValueError("dataset_manifest_not_admitted")
    if manifest.get("permanent_heldout_opened") is not False:
        raise ValueError("dataset_manifest_heldout_state_invalid")
    train = tuple(read_jsonl(root / "train.jsonl"))
    dev = tuple(read_jsonl(root / "dev.jsonl"))
    heldout = tuple(read_jsonl(root / "heldout.sealed.jsonl")) if open_heldout else None
    if len(train) != int(manifest["split_example_counts"]["train"]) or len(dev) != int(manifest["split_example_counts"]["dev"]):
        raise ValueError("dataset_count_mismatch")
    if open_heldout and len(heldout or ()) != int(manifest["split_example_counts"]["heldout"]):
        raise ValueError("heldout_count_mismatch")
    return DatasetBundle(
        root=root,
        manifest=manifest,
        train=train,
        dev=dev,
        heldout=heldout,
        register_labels=tuple(manifest["register_labels"]),
        manifest_sha256=sha256_file(manifest_path),
    )


def create_model(
    *,
    lineage_path: Path,
    lineage_label: str,
    attention_mode: str,
    trainable_scope: str,
    register_labels: Sequence[str],
) -> tuple[EfishPersonalJudgeJ1A, dict[str, Any]]:
    mx.random.seed(TRAINING_SEED)
    random.seed(TRAINING_SEED)
    model = EfishPersonalJudgeJ1A(register_count=len(register_labels), attention_mode=attention_mode)
    lineage = load_lineage_weights(model, lineage_path.resolve())
    configure_trainable_scope(model, scope=trainable_scope)
    model.train()
    report = parameter_report(model)
    return model, {
        "lineage_label": lineage_label,
        "attention_mode": attention_mode,
        "warm_start_label": (
            f"warm-started_from_{lineage_label}_representation"
            if attention_mode == "bidirectional"
            else f"continued_from_{lineage_label}_causal_representation"
        ),
        "source_checkpoint_parity_claim": False,
        "lineage": lineage,
        "parameter_report": report,
        "trainable_scope": trainable_scope,
        "architecture_sha256": architecture_sha256(
            register_labels=register_labels,
            attention_mode=attention_mode,
            scope=trainable_scope,
        ),
    }


def create_optimizer(model: EfishPersonalJudgeJ1A) -> Any:
    optimizer = optim.AdamW(
        learning_rate=OPTIMIZER_CONFIG["learning_rate"],
        betas=OPTIMIZER_CONFIG["betas"],
        eps=OPTIMIZER_CONFIG["epsilon"],
        weight_decay=OPTIMIZER_CONFIG["weight_decay"],
        bias_correction=False,
    )
    optimizer.init(model.trainable_parameters())
    mx.eval(optimizer.state)
    return optimizer


def _cross_entropy(logits: mx.array, label: int) -> mx.array:
    target = mx.array([label], dtype=mx.int32)
    return mx.mean(nn.losses.cross_entropy(logits, target, reduction="none"))


def _binary_cross_entropy(logits: mx.array, targets: Sequence[int]) -> mx.array:
    target = mx.array([list(targets)], dtype=mx.float32)
    # Numerically stable BCE with logits.
    return mx.mean(mx.maximum(logits, 0) - logits * target + mx.log1p(mx.exp(-mx.abs(logits))))


def _normalized_rows(weight: mx.array) -> mx.array:
    return weight / mx.sqrt(mx.sum(weight * weight, axis=-1, keepdims=True) + 1e-12)


def loss_components(
    model: EfishPersonalJudgeJ1A,
    token_ids: Sequence[int],
    *,
    domain_index: int,
    register_index: int,
    mechanics_targets: Sequence[int],
) -> dict[str, mx.array]:
    output = model(mx.array([list(token_ids)], dtype=mx.int32))
    domain_loss = _cross_entropy(output.domain_logits, domain_index)
    register_loss = _cross_entropy(output.register_logits, register_index)
    mechanics_loss = _binary_cross_entropy(output.mechanics_logits, mechanics_targets)
    temperature = float(OPTIMIZER_CONFIG["proxy_temperature"])
    domain_proxy = output.representation @ mx.transpose(_normalized_rows(model.domain_head.weight)) / temperature
    register_proxy = output.representation @ mx.transpose(_normalized_rows(model.register_head.weight)) / temperature
    contrastive = 0.5 * (_cross_entropy(domain_proxy, domain_index) + _cross_entropy(register_proxy, register_index))
    return {
        "domain": domain_loss,
        "register": register_loss,
        "mechanics": mechanics_loss,
        "contrastive": contrastive,
    }


def weighted_loss(
    model: EfishPersonalJudgeJ1A,
    token_ids: Sequence[int],
    domain_index: int,
    register_index: int,
    mechanics_targets: Sequence[int],
    loss_weights: Mapping[str, float],
) -> mx.array:
    components = loss_components(
        model,
        token_ids,
        domain_index=domain_index,
        register_index=register_index,
        mechanics_targets=mechanics_targets,
    )
    total = components["domain"] * float(loss_weights["domain"])
    for name in ("register", "mechanics", "contrastive"):
        total = total + components[name] * float(loss_weights[name])
    return total


def _tree_all_finite(tree: Any) -> bool:
    checks = [mx.all(mx.isfinite(value)) for _, value in tree_flatten(tree)]
    mx.eval(checks)
    return all(bool(value.item()) for value in checks)


def _gradient_clip(gradients: Any, *, divisor: int, max_norm: float) -> tuple[Any, float, float]:
    averaged = tree_map(lambda value: value / divisor, gradients)
    raw = gradient_global_norm(averaged)
    mx.eval(raw)
    raw_value = float(raw.item())
    if not math.isfinite(raw_value):
        raise FloatingPointError("non_finite_gradient_norm")
    scale = mx.minimum(mx.array(1.0, dtype=mx.float32), mx.array(max_norm, dtype=mx.float32) / (raw + 1e-12))
    clipped = tree_map(lambda value: value * scale.astype(value.dtype), averaged)
    clipped_norm = gradient_global_norm(clipped)
    mx.eval(clipped, clipped_norm)
    return clipped, raw_value, float(clipped_norm.item())


def trainable_parameter_norm(model: EfishPersonalJudgeJ1A) -> float:
    values = [mx.sum(value.astype(mx.float32) ** 2) for _, value in tree_flatten(model.trainable_parameters())]
    total = values[0]
    for value in values[1:]:
        total = total + value
    result = mx.sqrt(total)
    mx.eval(result)
    return float(result.item())


def _domain_schedule(rows: Sequence[dict[str, Any]], step: int) -> list[dict[str, Any]]:
    by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_domain[str(row["domain_label"])].append(row)
    if set(by_domain) != set(DOMAIN_LABELS):
        raise ValueError("training_domain_coverage_incomplete")
    selected: list[dict[str, Any]] = []
    for domain in DOMAIN_LABELS:
        ordered = sorted(
            by_domain[domain],
            key=lambda row: hashlib.sha256(f"{TRAINING_SEED}:{step // max(1, len(by_domain[domain]))}:{row['example_id']}".encode()).hexdigest(),
        )
        selected.append(ordered[step % len(ordered)])
    return selected


def _rss_bytes() -> int:
    import psutil

    result = int(psutil.Process().memory_info().rss)
    if result <= 0:
        raise RuntimeError("process_rss_telemetry_unavailable")
    return result


def _swap_bytes() -> dict[str, int]:
    result = subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True, check=True)
    return parse_swap_usage(result.stdout)


def _memory_pressure() -> dict[str, Any]:
    result = subprocess.run(["memory_pressure"], capture_output=True, text=True, check=True)
    return parse_memory_pressure(result.stdout)


def resource_snapshot(root: Path) -> dict[str, Any]:
    import psutil

    memory = psutil.virtual_memory()
    ram = {
        "system_ram_bytes": int(memory.total),
        "available_ram_bytes": int(memory.available),
        "memory_percent": float(memory.percent),
    }
    snapshot = {
        "measured_at": utc_now(),
        **ram,
        "swap": _swap_bytes(),
        "memory_pressure": _memory_pressure(),
        "process_rss_bytes": _rss_bytes(),
        "mlx_active_memory_bytes": int(mx.get_active_memory()),
        "mlx_cache_memory_bytes": int(mx.get_cache_memory()),
        "mlx_peak_memory_bytes": int(mx.get_peak_memory()),
        "free_disk_bytes": int(shutil.disk_usage(root).free),
    }
    validate_resource_snapshot(snapshot)
    return snapshot


@dataclass
class TrainingState:
    global_optimizer_step: int = 0
    examples_seen: int = 0
    optimizer_tokens: int = 0
    representation_target_examples: int = 0
    assistant_target_tokens: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "global_optimizer_step": self.global_optimizer_step,
            "examples_seen": self.examples_seen,
            "optimizer_tokens": self.optimizer_tokens,
            "representation_target_examples": self.representation_target_examples,
            "assistant_target_tokens": self.assistant_target_tokens,
        }


class ForegroundTrainer:
    def __init__(
        self,
        *,
        model: EfishPersonalJudgeJ1A,
        optimizer: Any,
        dataset: DatasetBundle,
        loss_weights: Mapping[str, float],
        state: TrainingState | None = None,
    ) -> None:
        self.model = model
        self.optimizer = optimizer
        self.dataset = dataset
        self.loss_weights = dict(loss_weights)
        if set(self.loss_weights) != set(DEFAULT_LOSS_WEIGHTS):
            raise ValueError("loss_weight_names_invalid")
        self.state = state or TrainingState()
        self.domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
        self.register_index = {value: index for index, value in enumerate(dataset.register_labels)}
        def objective(
            token_ids: Sequence[int],
            domain_index: int,
            register_index: int,
            mechanics_targets: Sequence[int],
            loss_weights: Mapping[str, float],
        ) -> mx.array:
            return weighted_loss(
                self.model,
                token_ids,
                domain_index,
                register_index,
                mechanics_targets,
                loss_weights,
            )

        self.loss_and_grad = nn.value_and_grad(model, objective)

    def train_one_update(self) -> dict[str, Any]:
        step_before = self.state.global_optimizer_step
        microbatches = _domain_schedule(self.dataset.train, step_before)
        gradient_buffer: Any | None = None
        component_totals = Counter()
        token_lengths: list[int] = []
        started = perf_counter()
        for row in microbatches:
            domain = self.domain_index[str(row["domain_label"])]
            register = self.register_index[str(row["register_label"])]
            token_ids = row["input_ids"]
            total, gradients = self.loss_and_grad(
                token_ids,
                domain,
                register,
                row["mechanics_labels"],
                self.loss_weights,
            )
            mx.eval(total, gradients)
            if not math.isfinite(float(total.item())) or not _tree_all_finite(gradients):
                raise FloatingPointError("non_finite_loss_or_gradient")
            gradient_buffer = add_gradient_trees(gradient_buffer, materialize_gradient_tree(gradients))
            parts = loss_components(
                self.model,
                token_ids,
                domain_index=domain,
                register_index=register,
                mechanics_targets=row["mechanics_labels"],
            )
            mx.eval(parts)
            for name, value in parts.items():
                component_totals[name] += float(value.item())
            token_lengths.append(len(token_ids))
        if gradient_buffer is None:
            raise AssertionError("empty_gradient_buffer")
        gradients, norm_before, norm_after = _gradient_clip(
            gradient_buffer,
            divisor=len(microbatches),
            max_norm=float(OPTIMIZER_CONFIG["gradient_clip_norm"]),
        )
        self.optimizer.update(self.model, gradients)
        mx.eval(self.model.parameters(), self.optimizer.state)
        if not _tree_all_finite(self.model.trainable_parameters()) or not _tree_all_finite(self.optimizer.state):
            raise FloatingPointError("non_finite_model_or_optimizer_after_update")
        self.state.global_optimizer_step += 1
        self.state.examples_seen += len(microbatches)
        self.state.representation_target_examples += len(microbatches)
        self.state.optimizer_tokens += sum(token_lengths)
        elapsed = perf_counter() - started
        combined = sum(component_totals[name] * self.loss_weights[name] for name in DEFAULT_LOSS_WEIGHTS) / len(microbatches)
        ordered_lengths = sorted(token_lengths)
        event = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            **self.state.as_dict(),
            "effective_batch": len(microbatches),
            "microbatch": 1,
            "gradient_accumulation": len(microbatches),
            "sequence_length_mean": sum(token_lengths) / len(token_lengths),
            "sequence_length_p95": ordered_lengths[-1],
            "L_domain": component_totals["domain"] / len(microbatches),
            "L_register": component_totals["register"] / len(microbatches),
            "L_mechanics": component_totals["mechanics"] / len(microbatches),
            "L_contrastive": component_totals["contrastive"] / len(microbatches),
            "combined_loss": combined,
            "learning_rate": OPTIMIZER_CONFIG["learning_rate"],
            "gradient_norm": norm_before,
            "gradient_norm_after_clip": norm_after,
            "trainable_parameter_norm": trainable_parameter_norm(self.model),
            "step_time_seconds": elapsed,
            "MLX_active_memory_bytes": int(mx.get_active_memory()),
            "MLX_peak_memory_bytes": int(mx.get_peak_memory()),
            "process_rss_bytes": _rss_bytes(),
            "raw_personal_text_logged": False,
        }
        return event


def calibration_report(
    *, model: EfishPersonalJudgeJ1A, dataset: DatasetBundle, output_path: Path
) -> dict[str, Any]:
    """Measure raw loss scale and gradient norm without an optimizer update."""

    rows = _domain_schedule(dataset.train, 0)
    domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
    register_index = {value: index for index, value in enumerate(dataset.register_labels)}
    raw: dict[str, list[float]] = defaultdict(list)
    gradient_norms: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        domain = domain_index[str(row["domain_label"])]
        register = register_index[str(row["register_label"])]
        for family in DEFAULT_LOSS_WEIGHTS:
            def objective(token_ids: Sequence[int], d: int, r: int, mechanics: Sequence[int]) -> mx.array:
                return loss_components(model, token_ids, domain_index=d, register_index=r, mechanics_targets=mechanics)[family]

            fn = nn.value_and_grad(model, objective)
            value, gradients = fn(row["input_ids"], domain, register, row["mechanics_labels"])
            mx.eval(value, gradients)
            raw[family].append(float(value.item()))
            norm = gradient_global_norm(gradients)
            mx.eval(norm)
            gradient_norms[family].append(float(norm.item()))
    report = {
        "schema_version": "r30j1a.loss-calibration.v1",
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "optimizer_updates": 0,
        "examples_examined": len(rows),
        "raw_loss_mean": {name: sum(values) / len(values) for name, values in raw.items()},
        "gradient_norm_mean": {name: sum(values) / len(values) for name, values in gradient_norms.items()},
        "frozen_loss_weights": dict(DEFAULT_LOSS_WEIGHTS),
        "dynamic_reweighting": False,
        "allowed_loss_families": list(DEFAULT_LOSS_WEIGHTS),
        "forbidden_loss_families": ["personal_fit", "persona_mode", "crocodile", "preference", "generation"],
    }
    atomic_json(output_path, report)
    return report


def _classification_metrics(truth: Sequence[int], pred: Sequence[int], labels: int) -> dict[str, Any]:
    confusion = [[0 for _ in range(labels)] for _ in range(labels)]
    for expected, actual in zip(truth, pred):
        confusion[int(expected)][int(actual)] += 1
    per_class = []
    for label in range(labels):
        tp = confusion[label][label]
        fp = sum(confusion[row][label] for row in range(labels) if row != label)
        fn = sum(confusion[label][column] for column in range(labels) if column != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class.append({"precision": precision, "recall": recall, "f1": f1, "support": sum(confusion[label])})
    return {
        "accuracy": sum(int(a == b) for a, b in zip(truth, pred)) / len(truth),
        "macro_f1": sum(row["f1"] for row in per_class) / labels,
        "balanced_accuracy": sum(row["recall"] for row in per_class) / labels,
        "per_class": per_class,
        "confusion_matrix": confusion,
    }


def _mechanics_metrics(truth: np.ndarray, pred: np.ndarray) -> dict[str, Any]:
    per_label = []
    for index in range(truth.shape[1]):
        expected, actual = truth[:, index], pred[:, index]
        tp = int(np.sum((expected == 1) & (actual == 1)))
        fp = int(np.sum((expected == 0) & (actual == 1)))
        fn = int(np.sum((expected == 1) & (actual == 0)))
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_label.append({"precision": precision, "recall": recall, "f1": f1, "support": int(expected.sum())})
    return {"macro_f1": sum(value["f1"] for value in per_label) / len(per_label), "per_label": per_label}


def reclaim_unused_mlx_memory() -> None:
    """Release unused host/Metal buffers at an explicit safe boundary."""

    gc.collect()
    mx.clear_cache()


def evaluate_rows(model: EfishPersonalJudgeJ1A, rows: Sequence[dict[str, Any]], register_labels: Sequence[str]) -> dict[str, Any]:
    if not rows:
        raise ValueError("empty_evaluation_rows")
    model.eval()
    domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
    register_index = {value: index for index, value in enumerate(register_labels)}
    domain_truth: list[int] = []
    domain_pred: list[int] = []
    register_truth: list[int] = []
    register_pred: list[int] = []
    mechanics_truth: list[list[int]] = []
    mechanics_pred: list[list[int]] = []
    confidences: list[tuple[float, str, bool]] = []
    embeddings: list[np.ndarray] = []
    started = perf_counter()
    for row in rows:
        output = model(mx.array([row["input_ids"]], dtype=mx.int32))
        mx.eval(output.representation, output.domain_logits, output.register_logits, output.mechanics_logits)
        d_prob = np.asarray(mx.softmax(output.domain_logits, axis=-1))[0]
        r_prob = np.asarray(mx.softmax(output.register_logits, axis=-1))[0]
        m_prob = 1.0 / (1.0 + np.exp(-np.asarray(output.mechanics_logits)[0]))
        expected_domain = domain_index[str(row["domain_label"])]
        actual_domain = int(np.argmax(d_prob))
        domain_truth.append(expected_domain)
        domain_pred.append(actual_domain)
        register_truth.append(register_index[str(row["register_label"])])
        register_pred.append(int(np.argmax(r_prob)))
        mechanics_truth.append([int(value) for value in row["mechanics_labels"]])
        mechanics_pred.append([int(value >= 0.5) for value in m_prob])
        confidences.append((float(np.max(d_prob)), str(row["example_id"]), expected_domain == actual_domain))
        embeddings.append(np.asarray(output.representation)[0].astype(np.float32))
    matrix = np.stack(embeddings)
    domain = _classification_metrics(domain_truth, domain_pred, len(DOMAIN_LABELS))
    register = _classification_metrics(register_truth, register_pred, len(register_labels))
    mechanics = _mechanics_metrics(np.asarray(mechanics_truth), np.asarray(mechanics_pred))
    normalized = matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
    cosine = normalized @ normalized.T
    np.fill_diagonal(cosine, -2.0)
    nearest = np.argmax(cosine, axis=1)
    retrieval = sum(
        rows[index]["register_label"] == rows[int(neighbor)]["register_label"]
        and rows[index]["source_group_id"] != rows[int(neighbor)]["source_group_id"]
        for index, neighbor in enumerate(nearest)
    ) / len(rows)
    by_semantic: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        by_semantic[str(row["semantic_family_id"])].append(index)
    matched_indices = [index for values in by_semantic.values() if len({rows[item]["domain_label"] for item in values}) > 1 for index in values]
    matched_accuracy = (
        sum(domain_truth[index] == domain_pred[index] for index in matched_indices) / len(matched_indices)
        if matched_indices else 0.0
    )
    norms = np.linalg.norm(matrix, axis=1)
    centered = matrix - matrix.mean(axis=0, keepdims=True)
    singular = np.linalg.svd(centered, compute_uv=False)
    variance = singular * singular
    effective_rank = float((variance.sum() ** 2) / max(float((variance * variance).sum()), 1e-12))
    confidence_sorted = sorted(confidences)
    result = {
        "example_count": len(rows),
        "domain": domain,
        "register": register,
        "mechanics": mechanics,
        "representation": {
            "same_register_nearest_neighbor_rate": retrieval,
            "matched_style_contrast_accuracy": matched_accuracy,
            "embedding_norm_mean": float(norms.mean()),
            "embedding_norm_std": float(norms.std()),
            "mean_pairwise_cosine": float((cosine[cosine > -1]).mean()) if np.any(cosine > -1) else 1.0,
            "effective_rank": effective_rank,
            "collapsed": bool(effective_rank < 2.0 or float(norms.std()) > 0.1),
        },
        "prediction_audit_ids": {
            "lowest_confidence": [item[1] for item in confidence_sorted[:8]],
            "highest_confidence_wrong": [item[1] for item in sorted((x for x in confidences if not x[2]), reverse=True)[:8]],
            "highest_confidence_correct": [item[1] for item in sorted((x for x in confidences if x[2]), reverse=True)[:8]],
        },
        "evaluation_elapsed_seconds": perf_counter() - started,
        "raw_text_persisted": False,
    }
    model.train()
    return result | {"_embeddings": matrix, "_domain_truth": domain_truth, "_domain_pred": domain_pred}


_ASSISTANT_PREFIX = re.compile(r"^(?:好的[，,]?|当然可以[，,]?|感谢你的提问[。.!！]?|这个问题很值得聊[。.!！]?)")
_PROJECT = re.compile(r"(?i)another[_ -]?brain|efish(?:other)?|deepseek")
_PROPER = re.compile(r"\b[A-Z][A-Za-z0-9_-]{2,}\b")
_ENGLISH = re.compile(r"\b[A-Za-z][A-Za-z0-9_-]*\b")


def _slice_response(name: str, response: str) -> str:
    if name == "punctuation_normalized":
        return re.sub(r"[，。！？；：、,.!?;:]", " ", response)
    if name == "assistant_phrase_removed":
        return _ASSISTANT_PREFIX.sub("", response).strip() or "…"
    if name == "owner_phrase_masked":
        return re.sub(r"我(?:觉得|会|更|不|想|希望)", "某人", response)
    if name == "proper_noun_removed":
        return _PROPER.sub("某名称", response)
    if name == "project_name_removed":
        return _PROJECT.sub("某项目", response)
    if name == "code_switch_balanced":
        return _ENGLISH.sub("术语", response)
    return response


def shortcut_slice_report(
    *,
    model: EfishPersonalJudgeJ1A,
    rows: Sequence[dict[str, Any]],
    register_labels: Sequence[str],
    tokenizer: Any,
    full_domain_macro_f1: float,
    resource_callback: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    by_domain_lengths: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        by_domain_lengths[str(row["domain_label"])].append(int(row["selected_tokens"]))
    lower = max(np.quantile(values, 0.20) for values in by_domain_lengths.values())
    upper = min(np.quantile(values, 0.80) for values in by_domain_lengths.values())
    matched_semantics = {
        key for key, values in _group_indices(rows, "semantic_family_id").items()
        if len({rows[index]["domain_label"] for index in values}) > 1
    }
    definitions: dict[str, list[dict[str, Any]]] = {
        "length_matched": [row for row in rows if lower <= int(row["selected_tokens"]) <= upper],
        "register_matched": _balanced_register_subset(rows),
        "topic_matched_where_possible": [row for row in rows if row["semantic_family_id"] in matched_semantics],
    }
    for name in (
        "punctuation_normalized",
        "assistant_phrase_removed",
        "owner_phrase_masked",
        "proper_noun_removed",
        "project_name_removed",
        "code_switch_balanced",
    ):
        transformed = []
        for row in rows:
            response = _slice_response(name, str(row["response"]))
            encoded = encode_dialogue_unit(tokenizer, register=str(row["register_label"]), context=str(row["context"]), response=response)
            transformed.append(dict(row) | {"input_ids": encoded["input_ids"], "selected_tokens": encoded["selected_tokens"]})
        definitions[name] = transformed
    output: dict[str, Any] = {}
    for name, values in definitions.items():
        if not values:
            output[name] = {"example_count": 0, "domain_macro_f1": None, "drop_points": None}
            continue
        result = evaluate_rows(model, values, register_labels)
        score = float(result["domain"]["macro_f1"])
        output[name] = {
            "example_count": len(values),
            "domain_macro_f1": score,
            "drop_points": (full_domain_macro_f1 - score) * 100.0,
        }
        del result
        reclaim_unused_mlx_memory()
        if resource_callback is not None:
            resource_callback(f"shortcut_slice:{name}")
    return output


def _group_indices(rows: Sequence[dict[str, Any]], field: str) -> dict[str, list[int]]:
    output: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        output[str(row[field])].append(index)
    return output


def _balanced_register_subset(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    by_register_domain: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_register_domain[(str(row["register_label"]), str(row["domain_label"]))].append(row)
    output: list[dict[str, Any]] = []
    for register in sorted({key[0] for key in by_register_domain}):
        present = [values for (label, _), values in by_register_domain.items() if label == register and values]
        if len(present) < 2:
            continue
        count = min(len(values) for values in present)
        for values in present:
            output.extend(sorted(values, key=lambda row: row["example_id"])[:count])
    return output


def evaluate_dev(
    *,
    model: EfishPersonalJudgeJ1A,
    dataset: DatasetBundle,
    tokenizer: Any,
    output_path: Path,
    resource_callback: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    reclaim_unused_mlx_memory()
    base = evaluate_rows(model, dataset.dev, dataset.register_labels)
    matrix = base.pop("_embeddings")
    base.pop("_domain_truth")
    base.pop("_domain_pred")
    reclaim_unused_mlx_memory()
    if resource_callback is not None:
        resource_callback("dev_base")
    slices = shortcut_slice_report(
        model=model,
        rows=dataset.dev,
        register_labels=dataset.register_labels,
        tokenizer=tokenizer,
        full_domain_macro_f1=float(base["domain"]["macro_f1"]),
        resource_callback=resource_callback,
    )
    report = {
        "schema_version": "r30j1a.dev-eval.v1",
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "split": "dev",
        **base,
        "shortcut_slices": slices,
        "maximum_shortcut_drop_points": max((float(value["drop_points"]) for value in slices.values() if value["drop_points"] is not None), default=0.0),
        "heldout_opened": False,
    }
    atomic_json(output_path, report)
    # Personal embeddings are ignored and never enter the tracked tree.
    embedding_path = output_path.with_name("dev_embeddings.npz")
    np.savez_compressed(embedding_path, embeddings=matrix)
    reclaim_unused_mlx_memory()
    if resource_callback is not None:
        resource_callback("dev_complete")
    return report


def _directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def save_checkpoint(
    root: Path,
    checkpoint_id: str,
    *,
    model: EfishPersonalJudgeJ1A,
    optimizer: Any,
    state: TrainingState,
    dataset: DatasetBundle,
    architecture: Mapping[str, Any],
    lineage: Mapping[str, Any],
    metrics: Mapping[str, Any],
) -> tuple[Path, dict[str, Any]]:
    if not checkpoint_id or "/" in checkpoint_id or checkpoint_id.startswith("."):
        raise ValueError("invalid_checkpoint_id")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    final = root / checkpoint_id
    if final.exists():
        raise FileExistsError("checkpoint_already_exists")
    temporary = Path(tempfile.mkdtemp(prefix=f".{checkpoint_id}.tmp-", dir=root))
    try:
        parameters = dict(tree_flatten(model.parameters()))
        optimizer_state = dict(tree_flatten(optimizer.state))
        mlx_rng = {f"state.{index}": value for index, value in enumerate(mx.random.state)}
        mx.eval(parameters, optimizer_state, mlx_rng)
        mx.save_safetensors(str(temporary / "model.safetensors"), parameters)
        mx.save_safetensors(str(temporary / "optimizer.safetensors"), optimizer_state)
        mx.save_safetensors(str(temporary / "mlx_rng.safetensors"), mlx_rng)
        atomic_json(temporary / "python_rng.json", {"python_random_state": _jsonable_rng(random.getstate())})
        atomic_json(temporary / "training_state.json", state.as_dict() | {"dataset_manifest_sha256": dataset.manifest_sha256})
        atomic_json(temporary / "scheduler_state.json", {"kind": "constant", "step": state.global_optimizer_step, "learning_rate": OPTIMIZER_CONFIG["learning_rate"]})
        atomic_json(temporary / "architecture.json", dict(architecture))
        atomic_json(temporary / "lineage.json", dict(lineage) | {"resume_kind": "resume", "warm_start_is_not_resume": True})
        atomic_json(temporary / "metrics.json", dict(metrics))
        hashes = {name: {"bytes": (temporary / name).stat().st_size, "sha256": sha256_file(temporary / name)} for name in CHECKPOINT_FILES}
        atomic_json(temporary / "checksums.json", {"schema_version": "r30j1a.checkpoint-checksums.v1", "files": hashes})
        projected = _directory_bytes(temporary)
        campaign_after = _directory_bytes(root.parent) + projected
        free_after = shutil.disk_usage(root).free - projected
        if campaign_after > 16_000_000_000 or free_after < 2_000_000_000:
            raise OSError("checkpoint_dynamic_storage_gate_failed")
        verify_checkpoint(temporary)
        os.replace(temporary, final)
        receipt = {
            "checkpoint_id": checkpoint_id,
            "checkpoint_bytes": _directory_bytes(final),
            "model_bytes": (final / "model.safetensors").stat().st_size,
            "optimizer_bytes": (final / "optimizer.safetensors").stat().st_size,
            "checkpoint_sha256": json_sha256(read_json(final / "checksums.json")),
            "dataset_manifest_sha256": dataset.manifest_sha256,
            "architecture_sha256": architecture["architecture_sha256"],
            "global_optimizer_step": state.global_optimizer_step,
            "campaign_storage_bytes_after": _directory_bytes(root.parent),
            "free_disk_bytes_after": shutil.disk_usage(root).free,
            "verified": True,
        }
        atomic_json(final / "checkpoint_receipt.json", receipt)
        return final, receipt
    except BaseException:
        if temporary.exists():
            shutil.rmtree(temporary)
        raise


def verify_checkpoint(path: Path) -> dict[str, Any]:
    checksums = read_json(path / "checksums.json")
    if set(checksums.get("files", {})) != set(CHECKPOINT_FILES):
        raise ValueError("checkpoint_file_set_mismatch")
    for name, receipt in checksums["files"].items():
        candidate = path / name
        if candidate.stat().st_size != int(receipt["bytes"]) or sha256_file(candidate) != receipt["sha256"]:
            raise ValueError("checkpoint_checksum_mismatch:" + name)
    state = read_json(path / "training_state.json")
    scheduler = read_json(path / "scheduler_state.json")
    if int(state["global_optimizer_step"]) != int(scheduler["step"]):
        raise ValueError("scheduler_step_mismatch")
    return {"valid": True, "checkpoint_id": path.name, "global_optimizer_step": int(state["global_optimizer_step"])}


def load_checkpoint(
    path: Path,
    *,
    dataset: DatasetBundle,
    lineage_path: Path,
) -> tuple[EfishPersonalJudgeJ1A, Any, TrainingState, dict[str, Any], dict[str, Any]]:
    verify_checkpoint(path)
    architecture = read_json(path / "architecture.json")
    lineage = read_json(path / "lineage.json")
    model, initial = create_model(
        lineage_path=lineage_path,
        lineage_label=str(lineage["lineage_label"]),
        attention_mode=str(architecture["attention_mode"]),
        trainable_scope=str(architecture["trainable_scope"]),
        register_labels=dataset.register_labels,
    )
    weights = mx.load(str(path / "model.safetensors"))
    model.load_weights(list(weights.items()), strict=True)
    optimizer = create_optimizer(model)
    optimizer.state = tree_unflatten(list(mx.load(str(path / "optimizer.safetensors")).items()))
    restored_mlx = list(mx.load(str(path / "mlx_rng.safetensors")).values())
    mx.random.state[:] = restored_mlx
    random.setstate(_restore_rng(read_json(path / "python_rng.json")["python_random_state"]))
    mx.eval(model.parameters(), optimizer.state)
    raw = read_json(path / "training_state.json")
    if raw["dataset_manifest_sha256"] != dataset.manifest_sha256:
        raise ValueError("resume_dataset_manifest_mismatch")
    state = TrainingState(**{key: int(raw[key]) for key in TrainingState().__dict__})
    return model, optimizer, state, architecture, initial | lineage


def array_tree_sha256(tree: Any) -> str:
    digest = hashlib.sha256()
    for name, value in sorted(tree_flatten(tree)):
        array = np.asarray(value)
        digest.update(name.encode())
        digest.update(str(array.dtype).encode())
        digest.update(json.dumps(list(array.shape), separators=(",", ":")).encode())
        digest.update(array.tobytes())
    return digest.hexdigest()


def checkpoint_storage_projection(checkpoint_receipt: Mapping[str, Any]) -> dict[str, Any]:
    one = int(checkpoint_receipt["checkpoint_bytes"])
    peak = one * 5  # four retained roles plus one atomic write
    return {
        "representative_checkpoint_bytes": one,
        "projected_peak_campaign_checkpoint_bytes": peak,
        "preferred_budget_bytes": 14_000_000_000,
        "hard_budget_bytes": 16_000_000_000,
        "projected_within_preferred": peak <= 14_000_000_000,
        "projected_within_hard": peak <= 16_000_000_000,
    }
