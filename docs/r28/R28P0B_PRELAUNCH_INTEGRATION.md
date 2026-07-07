# R28P0B Prelaunch Integration

R28P0B integrates the R27A12 handoff with the R27D3 static shell as a previewable prelaunch branch.

This round does not train, does not admit a product model, and does not commit model assets. The A12 handoff is consumed as read-only metadata. Candidate export, quantization, and loader smoke write ignored reports under `artifacts/r28p0b/`.

Current integration state:

- Base static shell: R27D3.
- A12 handoff status: `product_path_engineering_candidate`.
- Candidate route: `product_path_engineering_candidate`.
- Selected model: `new_96m`.
- Candidate asset handling: metadata-only; no weights, tokenizer files, exported shards, or quantized assets are tracked.
- Runtime mode: `candidate_manifest_experimental` while still `demo_static`.
- Product admission: false.
- Browser admission: false.
- Release checkpoint: false.

R28P0B keeps the D3 static shell as the user-visible product surface and adds candidate status, budget status, asset-cache status, adapter status, and release blockers.

D3 is superseded for prelaunch integration by this branch, but not for product admission. The runtime remains a static shell with mock/synthetic generation until a later B-line admission step.
