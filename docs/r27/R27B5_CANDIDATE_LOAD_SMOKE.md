# R27B5 Candidate Load Smoke

R27B5 uses the B2 export bridge for candidate load smoke, but keeps smoke status separate from product-path status.

## Smoke Steps

1. Discover a handoff candidate, or use the B2 fallback path.
2. Reconstruct checkpoint metadata when available.
3. Export candidate metadata/assets into ignored `artifacts/r27b2/` paths.
4. Quantize with the experimental q4 plan.
5. Write a same-origin candidate manifest.
6. Verify same-origin shard paths, checksums, and static budget metadata.
7. Use synthetic generation fallback unless real browser matmul is available.

## Current Local Smoke

No R27A10/R27A9B/R27A8B handoff was present. The B2 smoke path found an ignored R27A7 checkpoint and used it as an engineering export smoke candidate:

- candidate: `r27a7_mps_24h_large_decoder_v1_seg3_dialogue_sft`
- quantization: `q4_experimental`
- estimated q4 bytes: `3862544`
- loader smoke: passed
- generation mode: `synthetic_fallback`
- product model: `false`
- browser admission: `false`

This smoke proves the wrapper path can validate ignored local assets. It does not place the candidate into the product static bundle.

## Commands

```bash
python3 scripts/r27b2_export_candidate_assets.py --prefer-handoff --synthetic-if-missing
python3 scripts/r27b2_quantize_candidate_assets.py --quant q4 --synthetic-if-missing
python3 scripts/r27b2_write_candidate_static_manifest.py --synthetic-if-missing
python3 scripts/r27b2_browser_loader_smoke.py --synthetic-if-missing
```
