#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.public_corpus.fetch_public_samples import fetch_hf_metadata, fetch_hf_streaming, fetch_wikipedia_zh, write_jsonl
from src.training.public_corpus.license_admission import SOURCE_SPECS, decide_source, now_utc, write_json
from src.training.public_corpus.clean_public_corpus import clean_record

ART = ROOT / "artifacts/r27a3"
DECISIONS = ROOT / "data/training_registry/public_corpus_license_decisions.json"
LEDGER = ROOT / "data/training_registry/public_corpus_attribution_ledger.json"
REGISTRY = ROOT / "data/training_registry/public_corpus_registry.json"
DOC = ROOT / "docs/r27/R27A3_LICENSE_ADMISSION.md"

DEFAULT_SOURCES = "baai_industry_corpus,wikipedia_zh,skypile_150b,fineweb,fineweb_edu,infinity_instruct,wanjuan_cc"


def parse_sources(value):
    return [s.strip() for s in (value or DEFAULT_SOURCES).split(",") if s.strip()]


def clean_estimate(rows):
    clean = []
    by_lang = {}
    rejected = 0
    for row in rows:
        cleaned, reason = clean_record(row)
        if cleaned:
            clean.append(cleaned)
            lang = cleaned.get("language") or cleaned.get("language_hint") or "mixed"
            by_lang[lang] = by_lang.get(lang, 0) + 1
        else:
            rejected += 1
    zh = by_lang.get("zh", 0) + by_lang.get("mixed", 0)
    return {"clean_rows": len(clean), "clean_zh_or_mixed_rows": zh, "rejected_rows": rejected, "language_counts": by_lang}


def registry_dataset_from_decision(decision):
    return {
        "dataset_id": decision["dataset_id"],
        "upstream_name": decision["upstream_name"],
        "upstream_url": decision["upstream_url"],
        "metadata_source_url": decision["metadata_source_url"],
        "license_name": decision["license_name"],
        "license_url": decision["license_url"],
        "terms_url": decision["terms_url"],
        "access_status": decision["access_status"],
        "license_review_status": decision["license_review_status"],
        "allowed_to_fetch_metadata": decision["allowed_to_fetch_metadata"],
        "allowed_to_fetch_bounded_sample": decision["allowed_to_fetch_bounded_sample"],
        "allowed_to_train_engineering": decision["allowed_to_train_engineering"],
        "allowed_to_train_product_candidate": False,
        "allowed_to_release_weights": False,
        "allowed_to_train": decision["allowed_to_train_engineering"],
        "allowed_to_commit_raw": False,
        "allowed_to_store_raw_in_artifacts": decision["allowed_to_store_raw_in_artifacts"],
        "allowed_to_use_for_tokenizer": decision["allowed_to_train_engineering"],
        "allowed_to_use_for_teacher_probe": False,
        "license_obligations": decision["license_obligations"],
        "decision_scope": decision["decision_scope"],
        "decision_reason": decision["decision_reason"],
        "reviewed_at_utc": decision["retrieved_at_utc"],
        "reviewed_by": decision["reviewed_by"],
        "raw_artifact_path": f"artifacts/r27a3/raw_public_samples/{decision['dataset_id']}/",
        "processed_artifact_path": f"artifacts/r27a3/clean_public_samples/{decision['dataset_id']}/clean.jsonl",
        "checksum_manifest_path": f"artifacts/r27a3/manifests/{decision['dataset_id']}_sample_manifest.json",
        "pii_review_status": "required_before_training",
        "cot_review_status": "required_before_training",
        "hidden_prompt_review_status": "required_before_training",
        "secrets_review_status": "required_before_training",
        "excluded_pack_guard_status": "old_rows_51_100_excluded",
        "eval_prompt_leakage_guard_status": "required_before_training",
        "provenance_notes": decision["decision_reason"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--sources", default=DEFAULT_SOURCES)
    ap.add_argument("--max-total-raw-mb", type=int, default=100)
    ap.add_argument("--max-rows-per-source", type=int, default=2000)
    ap.add_argument("--max-bytes-per-source", type=int, default=25000000)
    ap.add_argument("--min-clean-public-rows", type=int, default=1000)
    ap.add_argument("--min-clean-zh-rows", type=int, default=500)
    ap.add_argument("--allow-zero-public", default="false")
    args = ap.parse_args()
    if not args.dry_run and not args.execute:
        args.dry_run = True
    max_total_bytes = args.max_total_raw_mb * 1024 * 1024
    total_bytes = 0
    decisions = []
    manifests = []
    attribution = []
    all_rows = []
    blockers = []
    for dataset_id in parse_sources(args.sources):
        spec = SOURCE_SPECS[dataset_id]
        meta_raw, meta_json = b"{}", {}
        try:
            if spec["metadata_source_url"].startswith("https://huggingface.co/api/"):
                meta_raw, meta_json = fetch_hf_metadata(dataset_id)
            else:
                meta_raw = json.dumps({"source": spec["metadata_source_url"]}).encode("utf-8")
                meta_json = {}
        except Exception as exc:
            blockers.append({"dataset_id": dataset_id, "stage": "metadata", "error": repr(exc)})
        decision = decide_source(dataset_id, meta_json, meta_raw)
        decision_dict = decision.to_dict()
        decisions.append(decision_dict)
        rows = []
        status = "dry_run_not_downloaded"
        error = ""
        if args.execute and decision.allowed_to_train_engineering:
            try:
                remaining_bytes = max(0, min(args.max_bytes_per_source, max_total_bytes - total_bytes))
                if spec.get("sample_method") == "hf_streaming":
                    rows, stream_report = fetch_hf_streaming(dataset_id, decision_dict, args.max_rows_per_source, remaining_bytes)
                    status = stream_report.get("status", "sample_fetched")
                    error = stream_report.get("error", "")
                elif dataset_id == "wikipedia_zh":
                    rows = fetch_wikipedia_zh(decision_dict, args.max_rows_per_source, remaining_bytes)
                    status = "sample_fetched"
                elif spec.get("sample_method") == "metadata_only_optional_r27a3":
                    status = "blocked_optional_metadata_only_in_r27a3"
                else:
                    status = "blocked_no_sampler"
                total_bytes += sum(len(row["text"].encode("utf-8")) for row in rows)
            except Exception as exc:
                status = "blocked_sample_fetch_failed"
                error = repr(exc)
                blockers.append({"dataset_id": dataset_id, "stage": "sample", "error": error})
        elif args.execute:
            status = "blocked_not_engineering_admitted"
        raw_path = ART / "raw_public_samples" / dataset_id / "raw.jsonl"
        if args.execute:
            write_jsonl(raw_path, rows)
        all_rows.extend(rows)
        est = clean_estimate(rows)
        manifest = {
            "dataset_id": dataset_id,
            "status": status,
            "error": error,
            "attempted_sample": bool(args.execute),
            "downloaded_rows": len(rows),
            "downloaded_bytes": sum(len(row["text"].encode("utf-8")) for row in rows),
            "raw_path": str(raw_path.relative_to(ROOT)),
            "clean_estimate": est,
            "allowed_to_train_engineering": decision.allowed_to_train_engineering,
        }
        manifests.append(manifest)
        attribution.append({
            "dataset_id": dataset_id,
            "upstream_name": decision.upstream_name,
            "upstream_url": decision.upstream_url,
            "license_name": decision.license_name,
            "license_url": decision.license_url,
            "license_obligations": decision.license_obligations,
            "sample_rows": len(rows),
            "sample_bytes": manifest["downloaded_bytes"],
        })
        if args.execute:
            write_json(ART / "manifests" / f"{dataset_id}_sample_manifest.json", manifest)
    estimates = clean_estimate(all_rows)
    report = {
        "ok": bool(args.dry_run or estimates["clean_rows"] >= args.min_clean_public_rows or args.allow_zero_public == "true" or blockers),
        "mode": "execute" if args.execute else "dry_run",
        "generated_at_utc": now_utc(),
        "public_downloaded_bytes": total_bytes,
        "raw_public_sample_rows": len(all_rows),
        "clean_estimate": estimates,
        "blockers": blockers,
        "manifests": manifests,
        "remote_model_weights_downloaded": False,
        "external_llm_api_called": False,
        "doubao_called": False,
    }
    if args.dry_run and (ART / "reports" / "public_sample_fetch_report.json").exists():
        prior = json.loads((ART / "reports" / "public_sample_fetch_report.json").read_text(encoding="utf-8"))
        prior_manifests = {m.get("dataset_id"): m for m in prior.get("manifests", [])}
        for entry in attribution:
            prior_manifest = prior_manifests.get(entry["dataset_id"], {})
            entry["sample_rows"] = prior_manifest.get("downloaded_rows", entry["sample_rows"])
            entry["sample_bytes"] = prior_manifest.get("downloaded_bytes", entry["sample_bytes"])
    write_json(DECISIONS, {"generated_at_utc": report["generated_at_utc"], "decisions": decisions})
    write_json(LEDGER, {"generated_at_utc": report["generated_at_utc"], "entries": attribution})
    registry = json.loads((ROOT / "data/training_registry/public_corpus_registry.json").read_text(encoding="utf-8"))
    existing = {d.get("dataset_id"): d for d in registry.get("datasets", [])}
    for decision in decisions:
        existing[decision["dataset_id"]] = {**existing.get(decision["dataset_id"], {}), **registry_dataset_from_decision(decision)}
    registry["datasets"] = list(existing.values())
    registry["phase"] = "R27A3"
    registry["registry_id"] = "r27a3_public_corpus_registry"
    registry["r27a3_license_decision_file"] = str(DECISIONS.relative_to(ROOT))
    registry["r27a3_attribution_ledger_file"] = str(LEDGER.relative_to(ROOT))
    registry.setdefault("rules", {})
    registry["rules"]["raw_artifacts_root"] = "artifacts/r27a3/raw_public_samples/"
    registry["rules"]["processed_artifacts_root"] = "artifacts/r27a3/clean_public_samples/"
    write_json(REGISTRY, registry)
    if args.execute:
        write_json(ART / "reports" / "public_sample_fetch_report.json", report)
    DOC.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# R27A3 License Admission", "", "Scope: engineering-only public corpus sampling. No product training, phase_4, release, raw commit, or weight commit is approved.", ""]
    for d in decisions:
        lines.append(f"- `{d['dataset_id']}`: `{d['license_review_status']}`, access `{d['access_status']}`, engineering `{d['allowed_to_train_engineering']}`, license `{d['license_name']}`, obligations `{', '.join(d['license_obligations']) or 'none'}`.")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    sys.stdout.flush()
    if args.execute and not report["ok"]:
        raise SystemExit("blocked_r27a3_public_sample_minimum_not_met")
    if args.execute:
        os._exit(0)


if __name__ == "__main__":
    main()
