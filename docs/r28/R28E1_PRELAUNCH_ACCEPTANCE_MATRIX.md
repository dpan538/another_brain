# R28E1 Prelaunch Acceptance Matrix

R28E1 is a prelaunch automation layer over the static browser chat shell. It converts the E0 demo QA posture into repeatable smoke checks for routes, runtime metadata, RAG/evidence behavior, adapter privacy, asset loader boundaries, mobile/accessibility markers, bundle budget, and non-claim gates.

## Command

```bash
npm run test:r28e1
python3 scripts/r28e1_acceptance_matrix.py
```

`npm run test:r28e1` verifies the matrix definition, CLI JSON output, docs coverage, budget, and non-claims. The direct Python command writes the tracked results report at `docs/r28/R28E1_ACCEPTANCE_RESULTS.md`.

## Scenario Contract

The acceptance matrix must keep these scenario ids:

- `static_route_exists`
- `chat_route_exists`
- `runtime_js_exists`
- `asset_manifest_valid`
- `runtime_mode_valid`
- `local_only_badge`
- `no_product_admission_claim`
- `rag_demo_evidence_path`
- `insufficient_evidence_fallback`
- `malicious_evidence_fallback`
- `conflicting_evidence_display`
- `adapter_json_import_valid`
- `adapter_plain_text_import_valid`
- `adapter_rejects_training_allowed_true`
- `adapter_clears_state`
- `asset_cache_same_origin_validation`
- `asset_checksum_failure_path`
- `synthetic_fallback_generation`
- `verifier_finalizer_path`
- `mobile_css_markers`
- `accessibility_markers`
- `bundle_under_100mb`
- `no_backend_inference`
- `no_external_llm_endpoint`
- `no_doubao`
- `no_hosted_vector_store`
- `no_tracked_artifacts`
- `no_root_docx_pdf`
- `no_data_public_ingestion`
- `build_vercel_pass`

## Synthetic/Demo Fallback

The matrix does not require real model assets. If model assets are absent, runtime checks use the existing synthetic browser draft and fallback behavior. The asset checks verify same-origin and checksum boundaries rather than admitting any weight files.

## Acceptance Bar

The branch is accepted when:

- all 30 scenarios pass.
- `build_output_bytes` stays below `max_total_static_bytes`.
- model and tokenizer declared bytes remain zero.
- no backend, external LLM, Doubao, hosted vector store, or product admission flags are introduced.
- no forbidden tracked artifacts, root DOCX/PDF files, or `data/public_ingestion` files are introduced.
