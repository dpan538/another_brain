# R27A12 Handoff Status

R27A12F confirms that the A12 handoff exists and is guarded as an engineering handoff only.

## Handoff

- Handoff route: `product_path_engineering_candidate`
- Ignored handoff artifact: `artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
- Tracked handoff summary: `data/training_registry/r27a12_browser_handoff_summary.json`
- Selected model: `new_96m`
- Selected checkpoint: `best_product_probe`
- Training ran: `true`
- Optimizer tokens: `10240000`
- Dialogue readiness: `candidate`
- RAG honesty: `basic_probe_clean`
- Safety guard: `clean`
- Collapse risk: `0.2`

## Budget Guard

- Full static 100MB fit: `true`
- Full static bundle estimate: `98385593` bytes
- Remaining bytes under 100MB: `1614407`
- Classification: `product_path_tight`

This is not browser admission. B-line must still run static budget, runtime, admission, and release gates before using any candidate assets.
