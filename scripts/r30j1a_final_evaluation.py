#!/usr/bin/env python3
"""Open the frozen J1A heldout once, evaluate, and build correction evidence."""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import math
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Iterable, Sequence


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

import mlx.core as mx  # noqa: E402
import numpy as np  # noqa: E402

from scripts.r30j1a_run_shortcut_baselines import (  # noqa: E402
    fit_softmax,
    hashed_character_features,
    fit_multinomial_nb,
    predict_nb,
    standardize,
)
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer  # noqa: E402
from src.training.mlx.r30j1a_contract import DOMAIN_LABELS, classification_report, surface_features  # noqa: E402
from src.training.mlx.r30j1a_training import (  # noqa: E402
    atomic_json,
    evaluate_rows,
    load_checkpoint,
    load_dataset,
    resource_snapshot,
    shortcut_slice_report,
    utc_now,
)


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temporary, 0o600); os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def entropy(probability: np.ndarray) -> float:
    safe = np.clip(probability, 1e-12, 1.0)
    return float(-(safe * np.log(safe)).sum())


def prediction_records(model: Any, rows: Sequence[dict[str, Any]], register_labels: Sequence[str]) -> tuple[list[dict[str, Any]], np.ndarray]:
    domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
    register_index = {value: index for index, value in enumerate(register_labels)}
    output, embeddings = [], []
    model.eval()
    for row in rows:
        result = model(mx.array([row["input_ids"]], dtype=mx.int32))
        mx.eval(result.representation, result.domain_logits, result.register_logits, result.mechanics_logits)
        domain_probability = np.asarray(mx.softmax(result.domain_logits, axis=-1))[0]
        register_probability = np.asarray(mx.softmax(result.register_logits, axis=-1))[0]
        mechanics_probability = 1.0 / (1.0 + np.exp(-np.asarray(result.mechanics_logits)[0]))
        domain_pred = int(domain_probability.argmax())
        register_pred = int(register_probability.argmax())
        ordered = np.sort(domain_probability)
        output.append({
            "example_id": row["example_id"],
            "expected_domain": row["domain_label"],
            "predicted_domain": DOMAIN_LABELS[domain_pred],
            "domain_correct": domain_pred == domain_index[row["domain_label"]],
            "domain_confidence": float(domain_probability[domain_pred]),
            "domain_entropy": entropy(domain_probability),
            "domain_margin": float(ordered[-1] - ordered[-2]),
            "expected_register": row["register_label"],
            "predicted_register": register_labels[register_pred],
            "register_correct": register_pred == register_index[row["register_label"]],
            "register_confidence": float(register_probability[register_pred]),
            "mechanics_probability": mechanics_probability.tolist(),
            "source_group_id": row["source_group_id"],
            "semantic_family_id": row["semantic_family_id"],
        })
        embeddings.append(np.asarray(result.representation)[0].astype(np.float32))
    model.train()
    return output, np.stack(embeddings)


def surface_heldout_baseline(train: Sequence[dict[str, Any]], heldout: Sequence[dict[str, Any]]) -> dict[str, Any]:
    domain_index = {value: index for index, value in enumerate(DOMAIN_LABELS)}
    train_x = np.asarray([surface_features(row["response"], token_count=row["selected_tokens"]) for row in train], dtype=np.float64)
    heldout_x = np.asarray([surface_features(row["response"], token_count=row["selected_tokens"]) for row in heldout], dtype=np.float64)
    train_x, heldout_x = standardize(train_x, heldout_x)
    train_y = np.asarray([domain_index[row["domain_label"]] for row in train], dtype=np.int64)
    heldout_y = np.asarray([domain_index[row["domain_label"]] for row in heldout], dtype=np.int64)
    model = fit_softmax(train_x, train_y, len(DOMAIN_LABELS))
    prediction = np.argmax(heldout_x @ model[0] + model[1], axis=1)
    surface = classification_report(heldout_y.tolist(), prediction.tolist(), DOMAIN_LABELS)
    semantic_domains: dict[str, set[str]] = defaultdict(set)
    for row in heldout:
        semantic_domains[str(row["semantic_family_id"])].add(str(row["domain_label"]))
    matched_families = {key for key, values in semantic_domains.items() if len(values) > 1}
    matched_indices = [index for index, row in enumerate(heldout) if row["semantic_family_id"] in matched_families]
    matched_surface = (
        classification_report(heldout_y[matched_indices].tolist(), prediction[matched_indices].tolist(), DOMAIN_LABELS)
        if matched_indices else None
    )
    train_lexical = hashed_character_features([row["response"] for row in train])
    heldout_lexical = hashed_character_features([row["response"] for row in heldout])
    lexical_model = fit_multinomial_nb(train_lexical, train_y, len(DOMAIN_LABELS))
    lexical = classification_report(heldout_y.tolist(), predict_nb(heldout_lexical, lexical_model).tolist(), DOMAIN_LABELS)
    return {"surface_s1": surface, "surface_s1_topic_matched": matched_surface, "lexical_s2": lexical}


def cluster_analysis(embeddings: np.ndarray, rows: Sequence[dict[str, Any]], predictions: Sequence[dict[str, Any]]) -> dict[str, Any]:
    centered = embeddings - embeddings.mean(axis=0, keepdims=True)
    _, singular, vectors = np.linalg.svd(centered, full_matrices=False)
    variance = singular * singular
    explained = variance / max(float(variance.sum()), 1e-12)
    pca = centered @ vectors[:8].T
    normalized = embeddings / np.maximum(np.linalg.norm(embeddings, axis=1, keepdims=True), 1e-12)
    cosine = normalized @ normalized.T
    np.fill_diagonal(cosine, -2.0)
    neighbour = np.argmax(cosine, axis=1)
    surprises = []
    for index, other in enumerate(neighbour):
        if rows[index]["register_label"] != rows[int(other)]["register_label"]:
            surprises.append({
                "example_id": rows[index]["example_id"],
                "neighbor_example_id": rows[int(other)]["example_id"],
                "cosine": float(cosine[index, int(other)]),
                "expected_register": rows[index]["register_label"],
                "neighbor_register": rows[int(other)]["register_label"],
            })
    return {
        "pca_explained_variance_first_8": explained[:8].tolist(),
        "pca_first_3_coordinates": [
            {"example_id": row["example_id"], "coordinates": pca[index, :3].tolist()}
            for index, row in enumerate(rows)
        ],
        "cluster_method": "pca_plus_nearest_neighbor_read_only",
        "umap_run": False,
        "nearest_neighbor_register_surprise_count": len(surprises),
        "nearest_neighbor_surprises": sorted(surprises, key=lambda row: row["cosine"], reverse=True)[:24],
        "uncertainty_region_count": sum(record["domain_confidence"] < 0.50 for record in predictions),
        "owner_blob_assumed": False,
        "chart_is_not_sufficient_evidence": True,
    }


def p2_mode_neighborhood(
    *, model: Any, tokenizer: ExactRuntimeTokenizer, register_labels: Sequence[str], p2_pack: Path, heldout_rows: Sequence[dict[str, Any]], heldout_embeddings: np.ndarray
) -> dict[str, Any]:
    if not p2_pack.is_file():
        return {"available": False, "reason": "p2_pack_missing", "trained_as_label": False}
    pack = json.loads(p2_pack.read_text(encoding="utf-8"))
    seed = pack.get("owner_asserted_mode_seed") or {}
    mode_id = seed.get("mode_id")
    stimuli: list[str] = []
    for item in pack.get("decision_items", []):
        targets = item.get("target_refs", [])
        if not any(target.get("target_type") == "mode" and target.get("target_id") == mode_id for target in targets):
            continue
        for scenario in item.get("scenario_pair") or []:
            text = scenario.get("text") if isinstance(scenario, dict) else None
            if isinstance(text, str) and text.strip():
                stimuli.append(text.strip())
    stimuli = list(dict.fromkeys(stimuli))
    if not stimuli:
        return {"available": False, "reason": "no_seed_linked_public_stimuli", "trained_as_label": False}
    register = "weird_question" if "weird_question" in register_labels else register_labels[0]
    seed_embeddings = []
    for text in stimuli:
        encoded = tokenizer.encode(f"<REGISTER>\n{register}\n</REGISTER>\n<CONTEXT>\n模式边界分析\n</CONTEXT>\n<RESPONSE>\n{text}\n</RESPONSE>\n<EOS>", max_tokens=511, add_bos=True) + [tokenizer.eos]
        result = model(mx.array([encoded], dtype=mx.int32))
        mx.eval(result.representation)
        seed_embeddings.append(np.asarray(result.representation)[0])
    centroid = np.mean(np.stack(seed_embeddings), axis=0)
    centroid /= max(float(np.linalg.norm(centroid)), 1e-12)
    normalized = heldout_embeddings / np.maximum(np.linalg.norm(heldout_embeddings, axis=1, keepdims=True), 1e-12)
    similarity = normalized @ centroid
    nearest = np.argsort(similarity)[::-1][:12]
    return {
        "available": True,
        "seed_status": seed.get("status"),
        "boundary_status": seed.get("boundary_status"),
        "stimulus_count": len(stimuli),
        "trained_as_label": False,
        "boundary_inferred": False,
        "neighborhood_interpretation": "mixed_neighborhood_pending_owner_correction",
        "nearest_heldout_items": [
            {"example_id": heldout_rows[int(index)]["example_id"], "similarity": float(similarity[int(index)])}
            for index in nearest
        ],
        "raw_p2_stimuli_persisted": False,
    }


def select_correction_items(
    rows: Sequence[dict[str, Any]], predictions: Sequence[dict[str, Any]], embeddings: np.ndarray, p2_pack: Path
) -> list[dict[str, Any]]:
    by_id = {row["example_id"]: row for row in rows}
    used: set[str] = set()
    selected: list[tuple[str, dict[str, Any]]] = []

    def take(category: str, candidates: Iterable[dict[str, Any]], count: int) -> None:
        for record in candidates:
            if len([1 for name, _ in selected if name == category]) >= count:
                break
            if record["example_id"] in used:
                continue
            used.add(record["example_id"]); selected.append((category, record))

    take("high_confidence_surprising_prediction", sorted((x for x in predictions if not x["domain_correct"]), key=lambda x: x["domain_confidence"], reverse=True), 18)
    take("lowest_confidence", sorted(predictions, key=lambda x: x["domain_confidence"]), 18)
    take("cluster_boundary", sorted(predictions, key=lambda x: x["domain_margin"]), 12)
    take("weird_absurd_crocodile_neighborhood", (x for x in predictions if x["expected_register"] == "weird_question"), 10)
    take("contradiction_candidate", sorted((x for x in predictions if x["predicted_register"] != x["expected_register"]), key=lambda x: x["register_confidence"], reverse=True), 8)
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in predictions: groups[record["semantic_family_id"]].append(record)
    reverse = [record for values in groups.values() if len({x["expected_domain"] for x in values}) > 1 for record in values]
    take("reverse_control", reverse, 8)
    take("coverage_fill", sorted(predictions, key=lambda x: x["domain_entropy"], reverse=True), 74 - len(selected))
    items = []
    for index, (category, prediction) in enumerate(selected, 1):
        row = by_id[prediction["example_id"]]
        items.append({
            "item_id": f"j1a-correction-{index:03d}",
            "category": category,
            "context": row["context"],
            "response": row["response"],
            "descriptive_model_output": {
                "predicted_domain": prediction["predicted_domain"],
                "expected_data_domain": prediction["expected_domain"],
                "predicted_register": prediction["predicted_register"],
                "expected_data_register": prediction["expected_register"],
                "confidence": prediction["domain_confidence"],
            },
            "allowed_actions": ["CORRECT", "WRONG", "DEPENDS", "EDIT", "UNSURE"],
            "wrong_change_required": True,
            "depends_condition_required": True,
            "preferred_response_optional": True,
            "owner_answer": None,
            "owner_condition": None,
            "owner_edit": None,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "future_campaign": "R30J1B_ONLY_AFTER_OWNER_REVIEW",
        })
    if not 60 <= len(items) <= 100:
        raise ValueError("owner_correction_pack_size_out_of_range")
    return items


def correction_html(pack: dict[str, Any]) -> str:
    seed = json.dumps(pack, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'\"><title>R30J1A Owner Correction</title><style>body{{font:15px system-ui;max-width:900px;margin:auto;padding:24px}}article{{border:1px solid #ccc;border-radius:12px;padding:16px;margin:14px 0}}button{{margin:4px}}textarea{{width:100%;min-height:72px}}pre{{white-space:pre-wrap}}</style><h1>R30J1A Owner Correction</h1><p>这些是模型提出的纠错问题，不是已经成立的偏好。所有内容只保存在本机。</p><main></main><button id=\"export\">导出草稿</button><script>const pack={seed};const state={{}};const main=document.querySelector('main');for(const item of pack.items){{const a=document.createElement('article');a.innerHTML=`<b>${{item.item_id}} · ${{item.category}}</b><pre>${{item.context}}\n\n${{item.response}}</pre><div>${{item.allowed_actions.map(x=>`<button data-a=\"${{x}}\">${{x}}</button>`).join('')}}</div><textarea placeholder=\"WRONG: 应改什么；DEPENDS: 条件；EDIT: 你的版本\"></textarea>`;a.querySelectorAll('button').forEach(b=>b.onclick=()=>{{state[item.item_id]={{action:b.dataset.a,note:a.querySelector('textarea').value}};localStorage.setItem('r30j1a-correction',JSON.stringify(state));}});main.append(a);}}document.querySelector('#export').onclick=()=>{{const blob=new Blob([JSON.stringify({{pack_id:pack.pack_id,owner_review_completed:false,allowed_for_training:false,responses:state}},null,2)],{{type:'application/json'}});const x=document.createElement('a');x.href=URL.createObjectURL(blob);x.download='r30j1a-owner-correction-draft.json';x.click();}};</script></html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "artifacts" / "r30j1a" / "dataset")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--lineage-path", type=Path, required=True)
    parser.add_argument("--final-segment", required=True)
    parser.add_argument("--tokenizer", type=Path, default=ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json")
    parser.add_argument("--p2-pack", type=Path, default=ROOT / "artifacts" / "r30j0" / "persona_excavation" / "elicitation_pack_v2.json")
    parser.add_argument("--open-frozen-heldout-once", action="store_true", required=True)
    args = parser.parse_args()
    report_root = args.artifact_root / "reports"
    open_receipt = report_root / "heldout_open_receipt.json"
    if open_receipt.exists():
        raise FileExistsError("permanent_j1a_heldout_already_opened")
    segment_root = args.artifact_root / "training_flight_recorder" / "segments" / args.final_segment
    parent = json.loads((segment_root / "parent_decision.json").read_text(encoding="utf-8"))
    if parent["decision"] not in {"HOLD", "CONTINUE"} or parent["checkpoint_verified"] is not True:
        raise ValueError("training_decisions_not_frozen")
    dataset = load_dataset(args.dataset_root, open_heldout=True)
    if dataset.heldout is None:
        raise AssertionError("explicit_heldout_open_failed")
    model, _, _, architecture, lineage = load_checkpoint(args.checkpoint, dataset=dataset, lineage_path=args.lineage_path)
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer)
    before = resource_snapshot(args.artifact_root)
    base = evaluate_rows(model, dataset.heldout, dataset.register_labels)
    heldout_embeddings = base.pop("_embeddings")
    base.pop("_domain_truth"); base.pop("_domain_pred")
    slices = shortcut_slice_report(
        model=model, rows=dataset.heldout, register_labels=dataset.register_labels,
        tokenizer=tokenizer, full_domain_macro_f1=float(base["domain"]["macro_f1"]),
    )
    baselines = surface_heldout_baseline(dataset.train, dataset.heldout)
    predictions, second_embeddings = prediction_records(model, dataset.heldout, dataset.register_labels)
    if not np.allclose(heldout_embeddings, second_embeddings, atol=0.0, rtol=0.0):
        raise ValueError("heldout_embedding_replay_mismatch")
    analysis = cluster_analysis(heldout_embeddings, dataset.heldout, predictions)
    p2 = p2_mode_neighborhood(
        model=model, tokenizer=tokenizer, register_labels=dataset.register_labels,
        p2_pack=args.p2_pack, heldout_rows=dataset.heldout, heldout_embeddings=heldout_embeddings,
    )
    report = {
        "schema_version": "r30j1a.heldout-final-eval.v1",
        "created_at": utc_now(),
        "heldout_opened_once": True,
        "heldout_example_count": len(dataset.heldout),
        "architecture_frozen": True,
        "training_decisions_frozen": True,
        "tuning_after_heldout": False,
        **base,
        "shortcut_slices": slices,
        "maximum_shortcut_drop_points": max(float(row["drop_points"]) for row in slices.values() if row["drop_points"] is not None),
        "baselines": baselines,
        "neural_uplift_over_surface_points": (float(base["domain"]["macro_f1"]) - float(baselines["surface_s1"]["macro_f1"])) * 100.0,
        "matched_slice_neural_accuracy": float(base["representation"]["matched_style_contrast_accuracy"]),
        "matched_slice_surface_accuracy": float(baselines["surface_s1_topic_matched"]["accuracy"]) if baselines["surface_s1_topic_matched"] else 0.0,
        "matched_slice_neural_uplift_points": (
            float(base["representation"]["matched_style_contrast_accuracy"])
            - (float(baselines["surface_s1_topic_matched"]["accuracy"]) if baselines["surface_s1_topic_matched"] else 0.0)
        ) * 100.0,
        "resource": {"before": before, "after": resource_snapshot(args.artifact_root)},
        "network_api_requests": 0,
        "raw_text_persisted_in_report": False,
    }
    representation_root = args.artifact_root / "representation_analysis"
    representation_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    np.savez_compressed(representation_root / "heldout_embeddings.npz", embeddings=heldout_embeddings)
    atomic_json(representation_root / "cluster_analysis.json", analysis)
    atomic_json(representation_root / "crocodile_neighborhood_analysis.json", p2)
    correction_root = args.artifact_root / "owner_correction_pack"
    provisional_pass = (
        float(report["domain"]["macro_f1"]) >= 0.75
        and float(report["register"]["macro_f1"]) >= 0.65
        and float(report["representation"]["matched_style_contrast_accuracy"]) >= 0.75
        and float(report["matched_slice_neural_uplift_points"]) >= 10.0
        and float(report["maximum_shortcut_drop_points"]) <= 15.0
        and report["representation"]["collapsed"] is False
    )
    if provisional_pass:
        # Correction candidates use dev, not the permanent heldout, so the
        # final evidence set remains a frozen evaluation reference.
        dev_predictions, dev_embeddings = prediction_records(model, dataset.dev, dataset.register_labels)
        items = select_correction_items(dataset.dev, dev_predictions, dev_embeddings, args.p2_pack)
        pack = {
            "schema_version": "r30j1a.owner-correction-pack.v1",
            "pack_id": "r30j1a-correction-" + architecture["architecture_sha256"][:12],
            "status": "OWNER_CORRECTION_REQUIRED",
            "source_split": "dev",
            "heldout_items_used": 0,
            "item_count": len(items),
            "actions": ["CORRECT", "WRONG", "DEPENDS", "EDIT", "UNSURE"],
            "owner_review_completed": False,
            "normative_gold_created": False,
            "allowed_for_training": False,
            "r30j1b_authorized": False,
            "old_190_completion_required_first": False,
            "items": items,
        }
        atomic_json(correction_root / "owner_correction_pack.json", pack)
        atomic_text(correction_root / "index.html", correction_html(pack))
        correction_item_count = len(items)
    else:
        atomic_json(correction_root / "owner_correction_pack_not_created.json", {
            "schema_version": "r30j1a.owner-correction-pack-decision.v1",
            "created": False,
            "reason": "representation_value_gates_not_all_met",
            "owner_review_completed": False,
            "allowed_for_training": False,
        })
        correction_item_count = 0
    report["provisional_value_gates_pass"] = provisional_pass
    report["owner_correction_pack_created"] = provisional_pass
    report["owner_correction_item_count"] = correction_item_count
    atomic_json(report_root / "heldout_final_evaluation.json", report)
    atomic_json(open_receipt, {
        "schema_version": "r30j1a.heldout-open-receipt.v1",
        "opened_at": utc_now(),
        "opened_once": True,
        "architecture_sha256": architecture["architecture_sha256"],
        "checkpoint": args.checkpoint.name,
        "tuning_permitted_after_open": False,
        "heldout_example_count": len(dataset.heldout),
    })
    state_path = args.artifact_root / "campaign_state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state.update({"state": "REPRESENTATION_ANALYSIS", "heldout_opened": True, "tuning_after_heldout": False, "updated_at": utc_now()})
    atomic_json(state_path, state)
    print(json.dumps({
        "valid": True,
        "heldout_opened_once": True,
        "domain_macro_f1": report["domain"]["macro_f1"],
        "register_macro_f1": report["register"]["macro_f1"],
        "matched_style": report["representation"]["matched_style_contrast_accuracy"],
        "surface_uplift_points": report["neural_uplift_over_surface_points"],
        "maximum_shortcut_drop_points": report["maximum_shortcut_drop_points"],
        "correction_items": correction_item_count,
        "provisional_value_gates_pass": provisional_pass,
        "tuning_after_heldout": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
