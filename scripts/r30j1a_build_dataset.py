#!/usr/bin/env python3
"""Build the ignored, descriptive-only R30J1A dataset.

The builder admits only the hash-bound P1 owner-answer transcripts that remain
public-safe and the previously admitted public-safe R2 dialogue corpus.  It
never calls a network service, never reads the DeepSeek secret, and never uses
P2 elicitation items as examples.  All populated rows stay under ignored
``artifacts/r30j1a``.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Iterable, Mapping


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from src.personal_judge.source_evidence_contract import contains_sensitive_content  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer  # noqa: E402
from src.training.mlx.r30j1a_contract import (  # noqa: E402
    ADMISSION_CLASSES,
    CAMPAIGN_ID,
    CAMPAIGN_SEED,
    CONTROLLED_MUTATIONS,
    DOMAIN_LABELS,
    MECHANICS_LABELS,
    apply_controlled_mutation,
    deterministic_group_splits,
    encode_dialogue_unit,
    mechanics_vector,
    owner_register,
    public_register,
    sha256_json,
    stable_id,
    validate_source_split_integrity,
)


OWNER_GLOBS = (
    "training/llm_corpus/r26e_user_answered_*.jsonl",
    "training/llm_corpus/r26g_user_answered_*.jsonl",
)
R2_REQUIRED = (
    "dataset_manifest.json",
    "train.jsonl",
    "dev.jsonl",
    "full_semantic_audit.json",
    "split_integrity.json",
)
TARGET_MINIMUM = 2_500
TARGET_PREFERRED_MINIMUM = 4_000
TARGET_PREFERRED_MAXIMUM = 6_000
TARGET_HARD_MAXIMUM = 8_000


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


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


def atomic_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    atomic_text(path, "".join(json.dumps(dict(row), ensure_ascii=False, sort_keys=True) + "\n" for row in rows))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def safe_row_code(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9._-]+", "-", value.casefold()).strip("-._")
    if len(normalized) < 3:
        normalized = "row-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return normalized[:120]


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", "", value).casefold()


def recursive_public_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        if len(value.strip()) >= 6:
            yield value
    elif isinstance(value, list):
        for item in value:
            yield from recursive_public_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key not in {"owner_asserted_mode_seed", "responses", "owner_written_responses"}:
                yield from recursive_public_strings(item)


def owner_inventory_map(inventory_path: Path) -> dict[str, dict[str, Any]]:
    payload = read_json(inventory_path)
    sources = payload.get("sources") if isinstance(payload, dict) else None
    if not isinstance(sources, list):
        raise ValueError("p1_source_inventory_invalid")
    return {
        str(record["logical_path"]): record
        for record in sources
        if record.get("authorship_class") == "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"
        and "#row-" in str(record.get("logical_path", ""))
    }


def owner_context(row: Mapping[str, Any]) -> str:
    messages = row.get("messages")
    if not isinstance(messages, list) or len(messages) != 2:
        raise ValueError("owner_transcript_must_be_two_turn_dialogue")
    first, second = messages
    if first.get("role") != "user" or second.get("role") != "assistant":
        raise ValueError("owner_transcript_role_contract_failed")
    if second.get("content") != row.get("target_answer"):
        raise ValueError("owner_transcript_target_mismatch")
    return str(first.get("content", "")).strip()


def public_context(row: Mapping[str, Any]) -> str:
    messages = row.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValueError("public_dialogue_messages_missing")
    rendered: list[str] = []
    for message in messages:
        role = message.get("role")
        content = str(message.get("content", "")).strip()
        if role not in {"user", "assistant"} or not content:
            raise ValueError("public_dialogue_message_invalid")
        rendered.append(("用户：" if role == "user" else "回答：") + content)
    return "\n".join(rendered)


def base_record(
    *,
    source_kind: str,
    source_ref: str,
    source_group_id: str,
    semantic_family_id: str,
    register: str,
    domain: str,
    context: str,
    response: str,
    mutation_id: str,
    admission_class: str,
    tokenizer: ExactRuntimeTokenizer,
) -> dict[str, Any]:
    if domain not in DOMAIN_LABELS:
        raise ValueError("unknown_domain_label")
    if admission_class not in ADMISSION_CLASSES[:2]:
        raise ValueError("nontraining_admission_reached_dataset")
    encoded = encode_dialogue_unit(tokenizer, register=register, context=context, response=response)
    mutation_family = stable_id("mutfam", source_group_id, semantic_family_id)
    example_id = stable_id("j1a", source_kind, source_ref, mutation_id)
    return {
        "schema_version": "r30j1a.descriptive-example.v1",
        "example_id": example_id,
        "source_kind": source_kind,
        "source_ref": source_ref,
        "source_group_id": source_group_id,
        "semantic_family_id": semantic_family_id,
        "mutation_family_id": mutation_family,
        "mutation_id": mutation_id,
        "admission_class": admission_class,
        "domain_label": domain,
        "register_label": register,
        "mechanics_labels": mechanics_vector(response),
        "context": context,
        "response": response,
        "serialized_text": encoded["serialized_text"],
        "input_ids": encoded["input_ids"],
        "original_tokens": encoded["original_tokens"],
        "selected_tokens": encoded["selected_tokens"],
        "window_method": encoded["window_method"],
        "semantic_cut_detected": encoded["semantic_cut_detected"],
        "public_safe": True,
        "normative_label": False,
        "personal_fit_label": False,
        "persona_mode_label": False,
        "allowed_for_training": True,
    }


def load_owner_units(
    *, inventory_path: Path, tokenizer: ExactRuntimeTokenizer
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_logical = owner_inventory_map(inventory_path)
    rows: list[dict[str, Any]] = []
    rejected = Counter()
    admitted_sources = 0
    mutations_attempted = 0
    mutations_admitted = 0
    for pattern in OWNER_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            relative = path.relative_to(ROOT).as_posix()
            for ordinal, row in enumerate(read_jsonl(path), 1):
                row_value = str(row.get("source_row_id") or row.get("sample_id") or ordinal)
                inventory = by_logical.get(f"{relative}#row-{safe_row_code(row_value)}")
                if inventory is None:
                    raise ValueError("owner_row_missing_p1_inventory_binding")
                if inventory.get("allowed_for_style_analysis") is not True:
                    rejected["p1_not_allowed_for_style_analysis"] += 1
                    continue
                if inventory.get("contains_sensitive_sections") is True:
                    rejected["p1_sensitive_section"] += 1
                    continue
                response = str(row.get("target_answer", "")).strip()
                context = owner_context(row)
                if contains_sensitive_content(context + "\n" + response):
                    rejected["conservative_sensitive_content_scan"] += 1
                    continue
                required = (
                    row.get("training_allowed") is True,
                    row.get("public_commit_allowed") is True,
                    row.get("contains_private_data") is False,
                    row.get("review_status") == "reviewed_for_training_corpus",
                    isinstance(row.get("provenance"), dict),
                    row.get("provenance", {}).get("external_llm_used") is False,
                )
                if not all(required):
                    rejected["owner_process_provenance_failed"] += 1
                    continue
                source_ref = stable_id("ownerref", str(row.get("sample_id")))
                source_group = stable_id("ownersrc", str(row.get("sample_id")))
                # R26E predates ``display_id`` on part of the admitted
                # transcript set.  Treating a missing value as the literal
                # string ``None`` would collapse unrelated owner answers into
                # one semantic family.  Bind those older rows to the complete
                # normalized elicitation question instead, so repeated copies
                # of one idea remain grouped without splitting independent
                # answers or exposing the text in the identifier.
                semantic_key = str(row.get("display_id") or normalized_text(context))
                semantic_family = stable_id("owneridea", str(row.get("pack_id")), semantic_key)
                register = owner_register(row)
                rows.append(
                    base_record(
                        source_kind="owner_transcript",
                        source_ref=source_ref,
                        source_group_id=source_group,
                        semantic_family_id=semantic_family,
                        register=register,
                        domain="AUTHENTIC_OWNER",
                        context=context,
                        response=response,
                        mutation_id="original",
                        admission_class="TRAINING_PUBLIC_SAFE",
                        tokenizer=tokenizer,
                    )
                )
                admitted_sources += 1
                for mutation in CONTROLLED_MUTATIONS:
                    mutations_attempted += 1
                    try:
                        candidate = apply_controlled_mutation(response, mutation)
                    except ValueError:
                        rejected["owner_mutation_protected_content_failed"] += 1
                        continue
                    rows.append(
                        base_record(
                            source_kind="owner_controlled_variant",
                            source_ref=source_ref,
                            source_group_id=source_group,
                            semantic_family_id=semantic_family,
                            register=register,
                            domain="CONTROLLED_OWNER_STYLE_VARIANT",
                            context=context,
                            response=candidate,
                            mutation_id=mutation.mutation_id,
                            admission_class="TRAINING_PUBLIC_SAFE",
                            tokenizer=tokenizer,
                        )
                    )
                    mutations_admitted += 1
    return rows, {
        "owner_candidate_source_count": sum(1 for pattern in OWNER_GLOBS for path in ROOT.glob(pattern) for _ in read_jsonl(path)),
        "authentic_owner_source_count": admitted_sources,
        "controlled_owner_variant_count": mutations_admitted,
        "owner_mutations_attempted": mutations_attempted,
        "rejected_counts": dict(sorted(rejected.items())),
    }


def validate_r2_root(root: Path) -> None:
    missing = [name for name in R2_REQUIRED if not (root / name).is_file()]
    if missing:
        raise ValueError("r2_public_safe_source_missing:" + ",".join(missing))
    manifest = read_json(root / "dataset_manifest.json")
    if (
        manifest.get("admitted_for_engineering_sft") is not True
        or manifest.get("codex_semantic_review_completed") is not True
        or int(manifest.get("critical_issue_count", -1)) != 0
        or manifest.get("not_product_training_admission") is not True
    ):
        raise ValueError("r2_source_not_admitted_for_training")
    audit = read_json(root / "full_semantic_audit.json")
    if audit.get("valid") is not True:
        raise ValueError("r2_full_semantic_audit_not_valid")
    split = read_json(root / "split_integrity.json")
    if split.get("valid") is not True:
        raise ValueError("r2_split_integrity_not_valid")


def load_public_units(*, r2_root: Path, tokenizer: ExactRuntimeTokenizer) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    validate_r2_root(r2_root)
    raw_rows = read_jsonl(r2_root / "train.jsonl") + read_jsonl(r2_root / "dev.jsonl")
    rows: list[dict[str, Any]] = []
    rejected = Counter()
    for row in raw_rows:
        if row.get("review_status") not in {"pass", "project_authored_reviewed", "repaired"}:
            rejected["public_row_review_marker_missing"] += 1
            continue
        response = str(row.get("target", "")).strip()
        context = public_context(row)
        if contains_sensitive_content(context + "\n" + response):
            rejected["public_sensitive_content_scan"] += 1
            continue
        family_id = str(row.get("family_id", ""))
        session_id = str(row.get("session_id", ""))
        if not family_id or not session_id:
            raise ValueError("public_source_group_missing")
        source_ref = stable_id("publicref", session_id)
        source_group = stable_id("publicfamily", family_id)
        semantic_family = source_group
        register = public_register(row)
        rows.append(
            base_record(
                source_kind="public_safe_dialogue",
                source_ref=source_ref,
                source_group_id=source_group,
                semantic_family_id=semantic_family,
                register=register,
                domain="OTHER_PUBLIC_SAFE",
                context=context,
                response=response,
                mutation_id="original",
                admission_class="TRAINING_PUBLIC_SAFE",
                tokenizer=tokenizer,
            )
        )
        mutation_index = int(hashlib.sha256(session_id.encode()).hexdigest()[:8], 16) % len(CONTROLLED_MUTATIONS)
        mutation = CONTROLLED_MUTATIONS[mutation_index]
        try:
            candidate = apply_controlled_mutation(response, mutation)
        except ValueError:
            rejected["public_mutation_protected_content_failed"] += 1
            continue
        rows.append(
            base_record(
                source_kind="public_controlled_generic",
                source_ref=source_ref,
                source_group_id=source_group,
                semantic_family_id=semantic_family,
                register=register,
                domain="GENERIC_ASSISTANT",
                context=context,
                response=candidate,
                mutation_id=mutation.mutation_id,
                admission_class="TRAINING_PUBLIC_SAFE",
                tokenizer=tokenizer,
            )
        )
    return rows, {
        "public_candidate_row_count": len(raw_rows),
        "other_public_safe_count": sum(row["domain_label"] == "OTHER_PUBLIC_SAFE" for row in rows),
        "controlled_generic_count": sum(row["domain_label"] == "GENERIC_ASSISTANT" for row in rows),
        "rejected_counts": dict(sorted(rejected.items())),
    }


def assign_splits(rows: list[dict[str, Any]]) -> dict[str, str]:
    semantic_registers: dict[str, set[str]] = defaultdict(set)
    source_semantics: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        semantic_registers[row["semantic_family_id"]].add(row["register_label"])
        source_semantics[row["source_group_id"]].add(row["semantic_family_id"])
    inconsistent = [group for group, labels in semantic_registers.items() if len(labels) != 1]
    if inconsistent:
        raise ValueError("semantic_family_has_multiple_registers")
    if any(len(values) != 1 for values in source_semantics.values()):
        raise ValueError("source_group_has_multiple_semantic_families")
    groups_by_register: dict[str, list[str]] = defaultdict(list)
    for group, labels in semantic_registers.items():
        groups_by_register[next(iter(labels))].append(group)
    semantic_assignments = deterministic_group_splits(groups_by_register, seed=CAMPAIGN_SEED)
    for row in rows:
        row["split"] = semantic_assignments[row["semantic_family_id"]]
    return {
        source_group: semantic_assignments[next(iter(semantic_ids))]
        for source_group, semantic_ids in source_semantics.items()
    }


def p2_contamination_audit(rows: list[dict[str, Any]], p2_pack: Path) -> dict[str, Any]:
    payload = read_json(p2_pack)
    hashes = {
        hashlib.sha256(normalized_text(text).encode("utf-8")).hexdigest()
        for text in recursive_public_strings(payload)
        if normalized_text(text)
    }
    exact = 0
    for row in rows:
        for field in ("context", "response", "serialized_text"):
            value = normalized_text(str(row[field]))
            if value and hashlib.sha256(value.encode("utf-8")).hexdigest() in hashes:
                exact += 1
    if exact:
        raise ValueError("p2_elicitation_exact_text_entered_training_dataset")
    return {
        "valid": True,
        "p2_pack_sha256": sha256_file(p2_pack),
        "p2_public_string_hash_count": len(hashes),
        "exact_text_match_count": 0,
        "p2_item_source_count": 0,
        "future_owner_correction_item_source_count": 0,
    }


def distribution(rows: Iterable[Mapping[str, Any]], field: str) -> dict[str, int]:
    return dict(sorted(Counter(str(row[field]) for row in rows).items()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--inventory", type=Path, default=ROOT / "artifacts" / "r30j0" / "personal_sources" / "source_inventory.json")
    parser.add_argument("--p2-pack", type=Path, default=ROOT / "artifacts" / "r30j0" / "persona_excavation" / "elicitation_pack_v2.json")
    parser.add_argument("--r2-root", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, default=ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json")
    args = parser.parse_args()

    artifact_root = args.artifact_root.resolve()
    dataset_root = artifact_root / "dataset"
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    owner_rows, owner_receipt = load_owner_units(inventory_path=args.inventory.resolve(), tokenizer=tokenizer)
    public_rows, public_receipt = load_public_units(r2_root=args.r2_root.resolve(), tokenizer=tokenizer)
    rows = owner_rows + public_rows
    if len(rows) < TARGET_MINIMUM:
        raise ValueError(f"dataset_below_minimum:{len(rows)}")
    if len(rows) > TARGET_HARD_MAXIMUM:
        raise ValueError(f"dataset_above_hard_maximum:{len(rows)}")
    assignments = assign_splits(rows)
    split_report = validate_source_split_integrity(rows)
    contamination = p2_contamination_audit(rows, args.p2_pack.resolve())

    split_rows = {split: sorted((row for row in rows if row["split"] == split), key=lambda row: row["example_id"]) for split in ("train", "dev", "heldout")}
    if any(not values for values in split_rows.values()):
        raise ValueError("empty_dataset_split")
    source_counts = {
        split: len({row["source_group_id"] for row in values})
        for split, values in split_rows.items()
    }
    register_source_counts = {
        split: dict(sorted(Counter(row["register_label"] for row in {r["source_group_id"]: r for r in values}.values()).items()))
        for split, values in split_rows.items()
    }
    missing_registers = [
        register
        for register in sorted({row["register_label"] for row in rows})
        if any(register_source_counts[split].get(register, 0) == 0 for split in ("train", "dev", "heldout"))
    ]
    if missing_registers:
        raise ValueError("register_missing_from_split:" + ",".join(missing_registers))

    dataset_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    atomic_jsonl(dataset_root / "train.jsonl", split_rows["train"])
    atomic_jsonl(dataset_root / "dev.jsonl", split_rows["dev"])
    atomic_jsonl(dataset_root / "heldout.sealed.jsonl", split_rows["heldout"])
    split_freeze = {
        "schema_version": "r30j1a.split-freeze.v1",
        "campaign_id": CAMPAIGN_ID,
        "campaign_seed": CAMPAIGN_SEED,
        "frozen_at": utc_now(),
        "architecture_selection_split": "dev",
        "permanent_heldout_opened": False,
        "heldout_optimizer_access": False,
        "heldout_early_stopping_access": False,
        "source_group_assignments": dict(sorted(assignments.items())),
        "source_group_assignments_sha256": sha256_json(dict(sorted(assignments.items()))),
        "p2_elicitation_items_excluded": True,
        "future_owner_correction_items_excluded": True,
    }
    atomic_json(dataset_root / "split_freeze.json", split_freeze)
    atomic_json(dataset_root / "split_integrity.json", split_report | {"source_counts": source_counts, "register_source_counts": register_source_counts})
    atomic_json(dataset_root / "contamination_audit.json", contamination)
    atomic_json(dataset_root / "admission_audit.json", {
        "schema_version": "r30j1a.owner-data-admission.v1",
        "campaign_id": CAMPAIGN_ID,
        "owner": owner_receipt,
        "public_safe": public_receipt,
        "admission_classes": list(ADMISSION_CLASSES),
        "training_public_safe_count": len(rows),
        "training_deidentified_safe_count": 0,
        "analysis_only_count": 0,
        "rejected_source_or_mutation_count": sum(owner_receipt["rejected_counts"].values()) + sum(public_receipt["rejected_counts"].values()),
        "network_api_requests": 0,
        "deepseek_requests": 0,
        "raw_private_data_sent_external": False,
    })
    files = {
        name: {
            "bytes": (dataset_root / name).stat().st_size,
            "sha256": sha256_file(dataset_root / name),
        }
        for name in ("train.jsonl", "dev.jsonl", "heldout.sealed.jsonl", "split_freeze.json", "split_integrity.json", "contamination_audit.json", "admission_audit.json")
    }
    manifest = {
        "schema_version": "r30j1a.dataset-manifest.v1",
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "status": "SPLIT_FROZEN_HELDOUT_SEALED",
        "example_count": len(rows),
        "preferred_range_met": TARGET_PREFERRED_MINIMUM <= len(rows) <= TARGET_PREFERRED_MAXIMUM,
        "hard_maximum_respected": len(rows) <= TARGET_HARD_MAXIMUM,
        "split_example_counts": {split: len(values) for split, values in split_rows.items()},
        "split_source_counts": source_counts,
        "domain_distribution": distribution(rows, "domain_label"),
        "register_distribution": distribution(rows, "register_label"),
        "split_register_distribution": {split: distribution(values, "register_label") for split, values in split_rows.items()},
        "register_source_counts": register_source_counts,
        "mechanics_labels": list(MECHANICS_LABELS),
        "domain_labels": list(DOMAIN_LABELS),
        "register_labels": sorted({row["register_label"] for row in rows}),
        "authentic_owner_examples": owner_receipt["authentic_owner_source_count"],
        "controlled_owner_variants": owner_receipt["controlled_owner_variant_count"],
        "generic_examples": public_receipt["controlled_generic_count"],
        "other_public_safe_examples": public_receipt["other_public_safe_count"],
        "source_leakage": 0,
        "semantic_family_leakage": 0,
        "mutation_family_leakage": 0,
        "permanent_heldout_opened": False,
        "heldout_used_for_architecture_selection": False,
        "heldout_used_for_early_stopping": False,
        "p2_elicitation_examples": 0,
        "future_owner_correction_examples": 0,
        "normative_persona_labels": 0,
        "personal_fit_labels": 0,
        "persona_mode_labels": 0,
        "crocodile_classifier_labels": 0,
        "lm_generation_targets": 0,
        "context_length": 512,
        "normal_target": 448,
        "reserved_tokens": 64,
        "semantic_cut_detected_count": sum(bool(row["semantic_cut_detected"]) for row in rows),
        "window_method_distribution": distribution(rows, "window_method"),
        "token_length": {
            "minimum": min(row["selected_tokens"] for row in rows),
            "maximum": max(row["selected_tokens"] for row in rows),
            "mean": sum(row["selected_tokens"] for row in rows) / len(rows),
            "p95": sorted(row["selected_tokens"] for row in rows)[max(0, math_ceil(0.95 * len(rows)) - 1)],
        },
        "tokenizer_sha256": sha256_file(args.tokenizer.resolve()),
        "p1_inventory_sha256": sha256_file(args.inventory.resolve()),
        "r2_dataset_manifest_sha256": sha256_file(args.r2_root.resolve() / "dataset_manifest.json"),
        "p2_pack_sha256": sha256_file(args.p2_pack.resolve()),
        "files": files,
        "allowed_for_training": True,
        "descriptive_representation_only": True,
        "network_api_requests": 0,
    }
    manifest["manifest_content_sha256"] = sha256_json({key: value for key, value in manifest.items() if key != "manifest_content_sha256"})
    atomic_json(dataset_root / "dataset_manifest.json", manifest)
    manifest["files"]["dataset_manifest.json"] = {
        "bytes": (dataset_root / "dataset_manifest.json").stat().st_size,
        "sha256": sha256_file(dataset_root / "dataset_manifest.json"),
    }
    # The self-hash is intentionally not recursively rewritten; the per-file
    # receipt is written separately and binds the final manifest bytes.
    atomic_json(dataset_root / "checksums.json", {
        "schema_version": "r30j1a.dataset-checksums.v1",
        "files": {name: {"bytes": (dataset_root / name).stat().st_size, "sha256": sha256_file(dataset_root / name)} for name in sorted(path.name for path in dataset_root.iterdir() if path.is_file())},
    })
    atomic_json(artifact_root / "campaign_state.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SPLIT_FREEZE",
        "training_started": False,
        "global_optimizer_step": 0,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "heldout_opened": False,
        "current_process": None,
        "historical_p2_preserved": True,
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SPLIT_FREEZE",
        "process_running": False,
        "training_running": False,
        "background_training": False,
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "reports" / "dataset_build.json", {
        "campaign_id": CAMPAIGN_ID,
        "valid": True,
        "example_count": len(rows),
        "authentic_owner_examples": owner_receipt["authentic_owner_source_count"],
        "controlled_variants": owner_receipt["controlled_owner_variant_count"],
        "generic_examples": public_receipt["controlled_generic_count"],
        "register_distribution": manifest["register_distribution"],
        "split_source_counts": source_counts,
        "source_leakage": 0,
        "heldout_opened": False,
        "dataset_bytes": sum(path.stat().st_size for path in dataset_root.iterdir() if path.is_file()),
        "raw_text_printed": False,
        "network_api_requests": 0,
    })
    print(json.dumps({
        "campaign_id": CAMPAIGN_ID,
        "valid": True,
        "examples": len(rows),
        "authentic_owner_examples": owner_receipt["authentic_owner_source_count"],
        "controlled_variants": owner_receipt["controlled_owner_variant_count"],
        "generic_examples": public_receipt["controlled_generic_count"],
        "other_public_safe_examples": public_receipt["other_public_safe_count"],
        "split_source_counts": source_counts,
        "source_leakage": 0,
        "heldout_opened": False,
    }, ensure_ascii=False, sort_keys=True))
    return 0


def math_ceil(value: float) -> int:
    integer = int(value)
    return integer if value == integer else integer + 1


if __name__ == "__main__":
    raise SystemExit(main())
