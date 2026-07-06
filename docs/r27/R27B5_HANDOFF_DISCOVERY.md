# R27B5 Handoff Discovery

R27B5 discovers A-line browser candidate handoffs without modifying A-line artifacts.

## Discovery Order

1. `artifacts/r27a10/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
2. `artifacts/r27a9b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
3. `artifacts/r27a8b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
4. B2 synthetic candidate fallback

## Extracted Metadata

The discovery bridge reads JSON metadata and normalizes:

- `candidate_id`
- `checkpoint_path`
- `tokenizer_path`
- `model_config`
- `candidate_model_q4_bytes`
- `tokenizer_bytes`
- `shard_overhead_bytes`
- `manifest_overhead_bytes`
- non-admission flags

Paths are accepted only when they resolve inside the repository. Missing or unparseable fields become explicit blockers, not silent admissions.

## Fallback Behavior

If no A-line handoff exists, R27B5 returns `r27b2_synthetic_tiny` with blocker `no_a10_a9b_a8b_handoff_found`. This keeps the B4 static demo route usable while preventing any claim that a product candidate exists.

## Command

```bash
python3 scripts/r27b5_discover_handoff.py
```

The command writes an ignored report to `artifacts/r27b5/manifests/handoff_discovery.json`.
