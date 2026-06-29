# Personal 200M Mini Web-LLM Profile Plan

R25 legacy note: this document is retained for historical comparison only.
`personal_200m` and 100M-200M SLMs are not the final product target. The active
target is a same-origin static browser decoder LLM admitted by manifest, budget,
license/provenance, and no-backend checks.

The `personal_200m` profile is an optional local profile for devices with WebGPU. It is not the default public runtime.

## Definition

```text
personal_200m profile =
  optional full profile for users/devices with WebGPU
  target 100M-200M parameters, quantized q4/q8 where possible
  response SLA <= 3000 ms loaded page
  no cloud inference
  no private raw data in weights
  no free long generation
  verifier-gated
  solvers remain deterministic
  knowledge remains external cards/graph
  persona remains approved cards/methods
```

## Runtime Profiles

| Profile | Target | Status |
| --- | --- | --- |
| standard_gate | < 40 MB controlled gate + cards + solvers | default target |
| personal_100m | 100M class q4/q8 model, WebGPU preferred | candidate |
| personal_200m | 200M class q4/q8 model, WebGPU preferred | candidate |
| experimental_decoder | short-answer generator only | local-only, not public default |

## Hard Gates

- License must be verified from source, not guessed from a dataset/model card alone.
- The artifact must not contain private raw data, PDF/docx text, lyrics, or long copyrighted text.
- The model cannot replace deterministic solvers or hard verifiers.
- The model cannot produce final answers without verifier approval.
- If WebGPU is unavailable or latency exceeds 3000 ms, the profile must degrade to standard.
- No checkpoint, LoRA, adapter, or model weight is committed during R17 unless a later policy explicitly approves it.

## Readiness Meaning

`personal_200m` is ready only when license, size, local loading, WebGPU latency, WASM fallback behavior, privacy, copyright, and verifier gates all pass. Until then it remains an experimental profile plan.
