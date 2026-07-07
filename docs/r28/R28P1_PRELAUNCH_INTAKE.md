# R28P1 Prelaunch Intake

R28P1 reads the R28P0B static-shell metadata and the R27A12 handoff as release-candidate evidence. It does not train, download weights, copy checkpoint files, commit tokenizer artifacts, or admit a product/browser/release model.

Intake command:

```bash
python3 scripts/r28p1_intake_prelaunch.py
```

Generated local report:

```text
artifacts/r28p1/reports/prelaunch_intake.json
```

That report is ignored by git. It is evidence for the local gate, not a committed artifact.

Required interpretation:

- `demo_static shell`: the visible browser surface remains the static chat shell with synthetic/mock generation and static demo RAG.
- `metadata-bound engineering candidate`: A12 `new_96m` is represented by route, status, budget, and non-claim metadata only.
- `real model asset admission`: not completed; no model weights, tokenizer files, exported shards, quantized files, ONNX, or GGUF assets are admitted.

Expected current values:

- A12 candidate route: `product_path_engineering_candidate`.
- Model: `new_96m`.
- Release-candidate mode: `demo_static_with_engineering_candidate_metadata`.
- Estimated full static bundle: `98385593` bytes.
- 100MB margin: `1614407` bytes.
- Real browser model runtime: `false`.
- Static shell ready: `true`.

The intake report intentionally keeps release blockers open. R28P1 confirms preview-demo readiness, not product readiness.
