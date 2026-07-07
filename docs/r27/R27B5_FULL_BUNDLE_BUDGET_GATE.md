# R27B5 Full Bundle Budget Gate

R27B5 enforces the default product-path target as a full static bundle budget:

```text
current build output
+ candidate q4/int4 bytes
+ tokenizer bytes
+ shard overhead
+ manifest overhead
<= 100,000,000 bytes
```

The gate intentionally does not use model-only size as the admission criterion.

## Classification

- `product_path_fit`: the full projected bundle is under 100MB and keeps the configured safety margin.
- `product_path_tight`: the full projected bundle is under 100MB but below the configured safety margin.
- `research_only_budget_risk`: the candidate may be useful for smoke or research, but the full projected bundle is over 100MB.
- `blocked_over_budget`: the candidate model asset alone exceeds the 100MB target.
- `synthetic_only`: no candidate q4/int4 byte count was available, so the demo remains synthetic.

## Important Example

A 95MB q4 model is not a product-path fit when the existing B4/B5 static bundle is about 22MB. The projected static payload is roughly 117MB before tokenizer and shard overhead, so the route must be `research_only_budget_risk`, not `product_path_fit`.

## Current Local Report

The R27B5 local run produced:

- build output bytes: `22204601`
- RAG asset bytes: `2065`
- gate asset bytes: `609`
- runtime/app bytes: `36726`
- static file count: `158`
- classification: `synthetic_only`
- blocker: `no_candidate_model_q4_bytes`

## Command

```bash
python3 scripts/r27b5_full_bundle_budget_gate.py
```

The command writes an ignored report to `artifacts/r27b5/manifests/full_bundle_budget_gate.json`.
