#!/usr/bin/env python3
"""Run deterministic surface and shallow lexical baselines on R30J1A dev.

The permanent heldout file is intentionally never opened by this program.
No fitted baseline weights or source text are committed; aggregate evidence is
written only below the ignored campaign artifact root.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Iterable, Sequence

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from src.training.mlx.r30j1a_contract import (  # noqa: E402
    CAMPAIGN_ID,
    DOMAIN_LABELS,
    MECHANICS_LABELS,
    classification_report,
    multilabel_report,
    shortcut_transform,
    surface_features,
)


SEED = 3_001_101
LEXICAL_DIMENSIONS = 2048


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def standardize(train: np.ndarray, dev: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean = train.mean(axis=0, keepdims=True)
    std = train.std(axis=0, keepdims=True)
    std[std < 1e-6] = 1.0
    return (train - mean) / std, (dev - mean) / std


def fit_softmax(features: np.ndarray, labels: np.ndarray, class_count: int, *, epochs: int = 300) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    weights = rng.normal(0, 0.01, (features.shape[1], class_count))
    bias = np.zeros(class_count)
    counts = np.bincount(labels, minlength=class_count)
    sample_weights = len(labels) / np.maximum(1, class_count * counts[labels])
    for epoch in range(epochs):
        logits = features @ weights + bias
        logits -= logits.max(axis=1, keepdims=True)
        probability = np.exp(logits)
        probability /= probability.sum(axis=1, keepdims=True)
        probability[np.arange(len(labels)), labels] -= 1.0
        probability *= sample_weights[:, None]
        gradient = features.T @ probability / len(labels) + 1e-4 * weights
        gradient_bias = probability.mean(axis=0)
        learning_rate = 0.12 / math.sqrt(1.0 + epoch / 40.0)
        weights -= learning_rate * gradient
        bias -= learning_rate * gradient_bias
    return weights, bias


def fit_binary(features: np.ndarray, targets: np.ndarray, *, epochs: int = 220) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED + 1)
    weights = rng.normal(0, 0.01, (features.shape[1], targets.shape[1]))
    bias = np.zeros(targets.shape[1])
    positives = np.maximum(1, targets.sum(axis=0))
    negatives = np.maximum(1, len(targets) - positives)
    positive_weight = negatives / positives
    for epoch in range(epochs):
        logits = features @ weights + bias
        probability = 1.0 / (1.0 + np.exp(-np.clip(logits, -30, 30)))
        scale = np.where(targets == 1, positive_weight[None, :], 1.0)
        error = (probability - targets) * scale
        gradient = features.T @ error / len(targets) + 1e-4 * weights
        gradient_bias = error.mean(axis=0)
        learning_rate = 0.08 / math.sqrt(1.0 + epoch / 40.0)
        weights -= learning_rate * gradient
        bias -= learning_rate * gradient_bias
    return weights, bias


def hashed_character_features(texts: Sequence[str], dimensions: int = LEXICAL_DIMENSIONS) -> np.ndarray:
    result = np.zeros((len(texts), dimensions), dtype=np.float32)
    for row_index, text in enumerate(texts):
        normalized = re.sub(r"\s+", " ", text.casefold())
        grams = [normalized[index : index + width] for width in (1, 2, 3) for index in range(max(0, len(normalized) - width + 1))]
        for gram in grams:
            digest = hashlib.blake2b(gram.encode(), digest_size=8, person=b"r30j1a").digest()
            bucket = int.from_bytes(digest, "little") % dimensions
            result[row_index, bucket] += 1.0
        total = result[row_index].sum()
        if total:
            result[row_index] = np.log1p(result[row_index]) / math.sqrt(total)
    return result


def fit_multinomial_nb(features: np.ndarray, labels: np.ndarray, class_count: int) -> tuple[np.ndarray, np.ndarray]:
    counts = np.ones((class_count, features.shape[1]), dtype=np.float64)
    class_counts = np.ones(class_count, dtype=np.float64)
    for label in range(class_count):
        selected = features[labels == label]
        counts[label] += selected.sum(axis=0)
        class_counts[label] += len(selected)
    log_likelihood = np.log(counts / counts.sum(axis=1, keepdims=True))
    log_prior = np.log(class_counts / class_counts.sum())
    return log_likelihood, log_prior


def predict_nb(features: np.ndarray, model: tuple[np.ndarray, np.ndarray]) -> np.ndarray:
    likelihood, prior = model
    return np.argmax(features @ likelihood.T + prior[None, :], axis=1)


def subset_indices(dev: Sequence[dict[str, Any]], name: str) -> list[int]:
    if name == "topic_matched_where_possible":
        groups: dict[str, set[str]] = defaultdict(set)
        for row in dev:
            groups[str(row["semantic_family_id"])].add(str(row["domain_label"]))
        admitted = {key for key, values in groups.items() if len(values) > 1}
        return [index for index, row in enumerate(dev) if row["semantic_family_id"] in admitted]
    if name == "length_matched":
        by_domain: dict[str, list[int]] = defaultdict(list)
        for row in dev:
            by_domain[str(row["domain_label"])].append(int(row["selected_tokens"]))
        low = max(np.quantile(values, 0.20) for values in by_domain.values())
        high = min(np.quantile(values, 0.80) for values in by_domain.values())
        return [index for index, row in enumerate(dev) if low <= int(row["selected_tokens"]) <= high]
    if name == "register_matched":
        buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
        for index, row in enumerate(dev):
            buckets[(str(row["register_label"]), str(row["domain_label"]))].append(index)
        selected: list[int] = []
        for register in sorted({key[0] for key in buckets}):
            values = [bucket for (label, _), bucket in buckets.items() if label == register and bucket]
            if len(values) < 2:
                continue
            count = min(len(bucket) for bucket in values)
            for bucket in values:
                selected.extend(bucket[:count])
        return sorted(selected)
    return list(range(len(dev)))


def transformed_responses(dev: Sequence[dict[str, Any]], name: str) -> list[str]:
    if name == "code_switch_balanced":
        return [re.sub(r"\b[A-Za-z][A-Za-z0-9_-]*\b", "术语", str(row["response"])) for row in dev]
    return [shortcut_transform(str(row["response"]), name) for row in dev]


def report_predictions(truth: np.ndarray, predicted: np.ndarray, labels: Sequence[str]) -> dict[str, Any]:
    return classification_report(truth.tolist(), predicted.tolist(), labels)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "artifacts" / "r30j1a" / "dataset")
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    args = parser.parse_args()
    manifest = json.loads((args.dataset_root / "dataset_manifest.json").read_text(encoding="utf-8"))
    train = rows(args.dataset_root / "train.jsonl")
    dev = rows(args.dataset_root / "dev.jsonl")
    # No code path reads heldout.sealed.jsonl.
    register_labels = tuple(manifest["register_labels"])
    domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
    register_index = {value: index for index, value in enumerate(register_labels)}
    train_text = [str(row["response"]) for row in train]
    dev_text = [str(row["response"]) for row in dev]
    train_surface = np.asarray([surface_features(text, token_count=int(row["selected_tokens"])) for text, row in zip(train_text, train)], dtype=np.float64)
    dev_surface = np.asarray([surface_features(text, token_count=int(row["selected_tokens"])) for text, row in zip(dev_text, dev)], dtype=np.float64)
    train_surface, dev_surface = standardize(train_surface, dev_surface)
    train_domain = np.asarray([domain_index[str(row["domain_label"])] for row in train], dtype=np.int64)
    dev_domain = np.asarray([domain_index[str(row["domain_label"])] for row in dev], dtype=np.int64)
    train_register = np.asarray([register_index[str(row["register_label"])] for row in train], dtype=np.int64)
    dev_register = np.asarray([register_index[str(row["register_label"])] for row in dev], dtype=np.int64)
    train_mechanics = np.asarray([row["mechanics_labels"] for row in train], dtype=np.float64)
    dev_mechanics = np.asarray([row["mechanics_labels"] for row in dev], dtype=np.int64)
    domain_model = fit_softmax(train_surface, train_domain, len(DOMAIN_LABELS))
    register_model = fit_softmax(train_surface, train_register, len(register_labels))
    mechanics_model = fit_binary(train_surface, train_mechanics)
    domain_pred = np.argmax(dev_surface @ domain_model[0] + domain_model[1], axis=1)
    register_pred = np.argmax(dev_surface @ register_model[0] + register_model[1], axis=1)
    mechanics_pred = ((dev_surface @ mechanics_model[0] + mechanics_model[1]) >= 0).astype(int)
    surface_domain = report_predictions(dev_domain, domain_pred, DOMAIN_LABELS)
    surface = {
        "feature_count": int(train_surface.shape[1]),
        "domain": surface_domain,
        "register": report_predictions(dev_register, register_pred, register_labels),
        "mechanics": multilabel_report(dev_mechanics.tolist(), mechanics_pred.tolist(), MECHANICS_LABELS),
        "shortcut_slices": {},
    }
    full_f1 = float(surface_domain["macro_f1"])
    slice_names = (
        "length_matched", "register_matched", "topic_matched_where_possible",
        "punctuation_normalized", "assistant_phrase_removed", "owner_phrase_masked",
        "proper_noun_removed", "project_name_removed", "code_switch_balanced",
    )
    train_mean = np.asarray([surface_features(text, token_count=int(row["selected_tokens"])) for text, row in zip(train_text, train)]).mean(axis=0)
    train_std = np.asarray([surface_features(text, token_count=int(row["selected_tokens"])) for text, row in zip(train_text, train)]).std(axis=0)
    train_std[train_std < 1e-6] = 1.0
    for name in slice_names:
        indices = subset_indices(dev, name)
        texts = transformed_responses(dev, name)
        values = np.asarray([surface_features(texts[index], token_count=int(dev[index]["selected_tokens"])) for index in indices])
        values = (values - train_mean) / train_std
        predicted = np.argmax(values @ domain_model[0] + domain_model[1], axis=1)
        score = report_predictions(dev_domain[indices], predicted, DOMAIN_LABELS)
        surface["shortcut_slices"][name] = {
            "sample_count": len(indices),
            "domain_macro_f1": score["macro_f1"],
            "drop_points": (full_f1 - float(score["macro_f1"])) * 100.0,
        }
    train_lexical = hashed_character_features(train_text)
    dev_lexical = hashed_character_features(dev_text)
    lexical_domain_model = fit_multinomial_nb(train_lexical, train_domain, len(DOMAIN_LABELS))
    lexical_register_model = fit_multinomial_nb(train_lexical, train_register, len(register_labels))
    lexical = {
        "feature_count": LEXICAL_DIMENSIONS,
        "classifier": "hashed_character_1_3gram_multinomial_nb",
        "domain": report_predictions(dev_domain, predict_nb(dev_lexical, lexical_domain_model), DOMAIN_LABELS),
        "register": report_predictions(dev_register, predict_nb(dev_lexical, lexical_register_model), register_labels),
    }
    report = {
        "schema_version": "r30j1a.shortcut-baselines.v1",
        "campaign_id": CAMPAIGN_ID,
        "valid": True,
        "split": "dev",
        "heldout_opened": False,
        "train_examples": len(train),
        "dev_examples": len(dev),
        "surface_s1": surface,
        "lexical_s2": lexical,
        "raw_text_persisted": False,
        "fitted_weights_persisted": False,
        "network_api_requests": 0,
    }
    output = args.artifact_root / "reports" / "shortcut_baselines.json"
    atomic_json(output, report)
    print(json.dumps({
        "valid": True,
        "surface_domain_macro_f1": surface["domain"]["macro_f1"],
        "surface_register_macro_f1": surface["register"]["macro_f1"],
        "lexical_domain_macro_f1": lexical["domain"]["macro_f1"],
        "heldout_opened": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
