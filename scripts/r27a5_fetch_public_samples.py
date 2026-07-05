#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.public_corpus.fetch_public_samples import fetch_hf_metadata, fetch_hf_streaming, fetch_wikipedia_zh, write_jsonl
from src.training.public_corpus.license_admission import SOURCE_SPECS, decide_source, now_utc, write_json

ART = ROOT / "artifacts/r27a5"
DECISIONS = ROOT / "data/training_registry/public_corpus_license_decisions.json"
LEDGER = ROOT / "data/training_registry/public_corpus_attribution_ledger.json"
REGISTRY = ROOT / "data/training_registry/public_corpus_registry.json"
DOC = ROOT / "docs/r27/R27A5_PUBLIC_CORPUS_EXPANSION.md"
DEFAULT_SOURCES = "baai_industry_corpus,baai_industry_corpus2,fineweb_2,fineweb,wikipedia_zh,oasst1,baai_coig,baai_coig_pc,coig_cqia,infinity_instruct"


def parse_sources(value):
    return [s.strip() for s in (value or DEFAULT_SOURCES).split(",") if s.strip()]


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
        "allowed_to_train": decision["allowed_to_train_engineering"],
        "allowed_to_train_engineering": decision["allowed_to_train_engineering"],
        "allowed_to_train_product_candidate": False,
        "allowed_to_release_weights": False,
        "allowed_to_commit_raw": False,
        "allowed_to_store_raw_in_artifacts": decision["allowed_to_store_raw_in_artifacts"],
        "license_obligations": decision["license_obligations"],
        "decision_scope": "R27A5 engineering campaign only, not product training, not phase_4, not release",
        "decision_reason": decision["decision_reason"],
        "raw_artifact_path": f"artifacts/r27a5/raw_public_samples/{decision['dataset_id']}/",
        "processed_artifact_path": f"artifacts/r27a5/clean_public_samples/{decision['dataset_id']}/clean.jsonl",
        "reviewed_at_utc": decision["retrieved_at_utc"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sources", default=DEFAULT_SOURCES)
    ap.add_argument("--max-total-raw-mb", type=int, default=750)
    ap.add_argument("--max-rows-per-source", type=int, default=50000)
    ap.add_argument("--max-bytes-per-source", type=int, default=200000000)
    args = ap.parse_args()
    if not args.execute:
        args.dry_run = True
    total_bytes = 0
    decisions = []
    manifests = []
    blockers = []
    for dataset_id in parse_sources(args.sources):
        spec = SOURCE_SPECS[dataset_id]
        meta_raw, meta_json = b"{}", {}
        try:
            if spec["metadata_source_url"].startswith("https://huggingface.co/api/"):
                meta_raw, meta_json = fetch_hf_metadata(dataset_id)
            else:
                meta_raw = json.dumps({"source": spec["metadata_source_url"]}).encode()
        except Exception as exc:
            blockers.append({"dataset_id": dataset_id, "stage": "metadata", "error": repr(exc)})
        decision = decide_source(dataset_id, meta_json, meta_raw).to_dict()
        decision["decision_scope"] = "R27A5 engineering campaign only, not product training, not phase_4, not release"
        decisions.append(decision)
        rows = []
        status = "dry_run_not_downloaded"
        error = ""
        if args.execute and decision["allowed_to_train_engineering"]:
            try:
                remaining = min(args.max_bytes_per_source, args.max_total_raw_mb * 1024 * 1024 - total_bytes)
                if spec.get("sample_method", "").startswith("hf_streaming"):
                    rows, stream_report = fetch_hf_streaming(dataset_id, decision, args.max_rows_per_source, remaining)
                    status = stream_report.get("status", "sample_fetched")
                    error = stream_report.get("error", "")
                else:
                    status = "blocked_no_sampler"
                total_bytes += sum(len(r.get("text", "").encode("utf-8")) for r in rows)
            except Exception as exc:
                status = "blocked_sample_fetch_failed"
                error = repr(exc)
                blockers.append({"dataset_id": dataset_id, "stage": "sample", "error": error})
        elif args.execute:
            status = "blocked_not_engineering_admitted"
        raw_path = ART / "raw_public_samples" / dataset_id / "raw.jsonl"
        if args.execute:
            write_jsonl(raw_path, rows)
            write_json(ART / "manifests" / f"{dataset_id}_sample_manifest.json", {
                "dataset_id": dataset_id, "status": status, "error": error, "downloaded_rows": len(rows),
                "downloaded_bytes": sum(len(r.get("text", "").encode("utf-8")) for r in rows),
                "allowed_to_train_engineering": decision["allowed_to_train_engineering"], "raw_path": str(raw_path.relative_to(ROOT)),
            })
        manifests.append({"dataset_id": dataset_id, "status": status, "downloaded_rows": len(rows), "downloaded_bytes": sum(len(r.get("text", "").encode("utf-8")) for r in rows), "error": error})
    write_json(DECISIONS, {"generated_at_utc": now_utc(), "r27a5": True, "decisions": decisions})
    write_json(LEDGER, {"generated_at_utc": now_utc(), "entries": [{"dataset_id": d["dataset_id"], "upstream_url": d["upstream_url"], "license_name": d["license_name"], "license_obligations": d["license_obligations"], "sample_rows": next((m["downloaded_rows"] for m in manifests if m["dataset_id"] == d["dataset_id"]), 0), "sample_bytes": next((m["downloaded_bytes"] for m in manifests if m["dataset_id"] == d["dataset_id"]), 0)} for d in decisions]})
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    existing = {d.get("dataset_id"): d for d in registry.get("datasets", [])}
    for decision in decisions:
        existing[decision["dataset_id"]] = {**existing.get(decision["dataset_id"], {}), **registry_dataset_from_decision(decision)}
    registry["datasets"] = list(existing.values())
    registry["phase"] = "R27A5"
    registry["registry_id"] = "r27a5_public_corpus_registry"
    registry.setdefault("rules", {})
    registry["rules"]["raw_artifacts_root"] = "artifacts/r27a5/raw_public_samples/"
    registry["rules"]["processed_artifacts_root"] = "artifacts/r27a5/clean_public_samples/"
    write_json(REGISTRY, registry)
    report = {"ok": True, "mode": "execute" if args.execute else "dry_run", "public_downloaded_bytes": total_bytes, "raw_public_sample_rows": sum(m["downloaded_rows"] for m in manifests), "manifests": manifests, "blockers": blockers, "remote_model_weights_downloaded": False, "external_llm_api_called": False, "doubao_called": False}
    if args.execute:
        write_json(ART / "reports/public_sample_fetch_report.json", report)
    DOC.write_text("# R27A5 Public Corpus Expansion\n\n" + "\n".join(f"- `{m['dataset_id']}`: `{m['status']}`, rows `{m['downloaded_rows']}`, bytes `{m['downloaded_bytes']}`." for m in manifests) + "\n\nRaw and cleaned public text remains ignored under `artifacts/r27a5/`.\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
