# R28E1 Acceptance Matrix

R28E1 extends the R27E0 manual/demo QA harness into a 30-scenario automated prelaunch matrix. It is static-only and runs without training, model asset downloads, backend inference, external LLM APIs, Doubao, hosted vector stores, or product admission.

Run:

```bash
python3 scripts/r28e1_acceptance_matrix.py
```

The script emits machine-readable JSON and refreshes `docs/r28/R28E1_ACCEPTANCE_RESULTS.md`.

## Matrix Scenarios

1. `static_route_exists` - verifies the static web root, route index, runtime mode, and asset manifest files exist.
2. `chat_route_exists` - verifies the static chat route, form, and app module wiring exist.
3. `runtime_js_exists` - verifies browser runtime JS and the `BrowserChatRuntime` entrypoint exist.
4. `asset_manifest_valid` - validates manifest arrays, declared bytes, same-origin flags, and no external paths.
5. `runtime_mode_valid` - validates demo/static runtime mode and non-admission flags.
6. `local_only_badge` - verifies local-only and no-backend badge markers.
7. `no_product_admission_claim` - verifies UI/config do not claim product model or admission.
8. `rag_demo_evidence_path` - runs the browser runtime against synthetic demo evidence.
9. `insufficient_evidence_fallback` - verifies insufficient evidence falls back.
10. `malicious_evidence_fallback` - verifies malicious evidence is ignored/refused and falls back.
11. `conflicting_evidence_display` - verifies conflicting evidence is surfaced as a verifier block and UI reason label.
12. `adapter_json_import_valid` - verifies valid JSON adapter import remains local-session-only.
13. `adapter_plain_text_import_valid` - verifies plain text adapter import remains local-session-only.
14. `adapter_rejects_training_allowed_true` - verifies training-allowed adapter packets are rejected.
15. `adapter_clears_state` - verifies the adapter bridge can clear session state.
16. `asset_cache_same_origin_validation` - reuses R27B8 asset smoke for same-origin rejection.
17. `asset_checksum_failure_path` - reuses R27B8 asset smoke for checksum failure behavior.
18. `synthetic_fallback_generation` - verifies synthetic draft behavior and fallback copy when assets/evidence are missing.
19. `verifier_finalizer_path` - verifies the runtime reaches final state on sufficient evidence.
20. `mobile_css_markers` - verifies responsive and reduced-motion CSS markers.
21. `accessibility_markers` - verifies language, live regions, labels, tabs, and focus-visible markers.
22. `bundle_under_100mb` - verifies bundle report remains under the 100 MB static limit.
23. `no_backend_inference` - verifies no backend inference flags or route directories.
24. `no_external_llm_endpoint` - verifies no external LLM endpoint is configured in production static surfaces.
25. `no_doubao` - verifies no Doubao or Volcengine runtime endpoint is configured.
26. `no_hosted_vector_store` - verifies hosted vector store remains disabled.
27. `no_tracked_artifacts` - verifies no forbidden tracked model/artifact/payload paths, with existing static fixture allowlists.
28. `no_root_docx_pdf` - verifies no tracked root DOCX/PDF files.
29. `no_data_public_ingestion` - verifies no tracked `data/public_ingestion` paths.
30. `build_vercel_pass` - runs `npm run build:vercel`.

## Output Shape

The JSON report includes:

- `ok`
- `scenario_count`
- `passed`
- `failed`
- `scenarios`
- `budget`
- `non_claims`

Every scenario has `id`, `name`, `passed`, and `details`.
