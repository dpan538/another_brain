# R18 Reasoning Dataset License Audit

R18 treats reasoning datasets as license-gated inputs, not as automatically safe training material.

Admission rules:

- admitted datasets require a verified license URL;
- NC or ND sources are rejected for public runtime/model-weight use;
- unclear license sources remain candidate or rejected;
- dataset-card metadata alone is not enough;
- long passages, exam text, and rationales are excluded unless provenance is clear;
- imported rows must carry `source_id` and `source_license`;
- chain-of-thought/rationale text is stripped from training rows.

The registry lives at `data/external_sources/reasoning_dataset_registry.jsonl`.

`scripts/import_admitted_reasoning_dataset_samples.mjs` may attempt a small network import for admitted sources, but generated fallback rows are counted separately from network-imported external rows. Fallback rows must never be reported as proof of external dataset import.

