# R27E0 Acceptance Criteria

R27E0 acceptance proves the demo can be opened, manually exercised, and machine-checked without training or model admission. The pass/fail authority is the combination of `npm run test:r27e0`, `npm run build:vercel`, and `python3 scripts/r27e0_acceptance_check.py`.

## Hard Boundaries

- No training command is added to this gate.
- No model weights, tokenizer artifacts, exported tensors, quantized shards, ONNX files, or browser model assets are admitted by E0.
- No backend inference, external LLM API, hosted vector store, or external runtime dependency is allowed.
- Static RAG evidence remains demo-only and is not an answer bank.
- A future candidate may be discovered or smoke-tested elsewhere, but E0 must warn when no product-path model is admitted.

## Required Scenarios

| ID | Required result |
| --- | --- |
| `chat_route` | `/another_brain_chat/` serves or statically contains the chat shell, app module, and browser runtime. |
| `local_only_badge` | The first viewport includes a visible `Local only` badge. |
| `no_backend_external_runtime` | Config and manifests assert `backend_inference: false`, `external_llm_api: false`, and no external runtime dependency. |
| `chinese_prompt` | A Chinese prompt can pass through the browser runtime without encoding or pipeline failure. |
| `demo_evidence` | A demo prompt retrieves at least one local evidence packet from same-origin static RAG data. |
| `insufficient_evidence` | Empty or unrelated evidence produces `insufficient` or empty evidence status rather than an unsupported answer. |
| `malicious_evidence` | Evidence containing instruction-injection markers is blocked or refused by verifier/fallback logic. |
| `fallback` | A blocked verifier path produces a fallback answer and marks fallback as used. |
| `error_state` | A forced runtime generation failure produces a controlled fallback/error state instead of an uncaught crash. |
| `budget_report` | The bundle report is under the static budget and preserves `product_model: false`. |
| `non_product_warning` | If no admitted product model exists, UI/config show the non-product warning. |
| `same_origin_asset_manifest` | Manifest asset paths are relative same-origin paths and manifest flags require same-origin static assets. |
| `vercel_build` | The repo keeps `build:vercel` wired to the static Vercel build path and the separate build command passes. |
| `mobile_layout` | The chat shell has viewport metadata and responsive CSS for narrow screens. |
| `accessibility_markers` | The shell exposes labels, `aria-live` message updates, and form labels for keyboard/screen-reader use. |

## Machine Gate

`scripts/r27e0_acceptance_check.py` must produce JSON like:

```json
{
  "ok": true,
  "scenario_count": 15,
  "passed": 15,
  "failed": 0
}
```

Every scenario object must include `id`, `name`, `passed`, and `details`. Any failure must include actionable details rather than only a generic false value.

## Manual Gate

Manual QA follows `docs/r27/R27E0_MANUAL_QA_SCRIPT.md`. The manual pass should agree with the machine gate. If they disagree, the handoff is yellow until the mismatch is explained in the runbook notes.
