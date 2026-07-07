# R28STAB0 Runtime Soak

R28STAB0 is a pre-merge runtime stability soak for the static browser chat shell. It does not train, download weights, add model assets, connect backend inference, call external LLM APIs, or claim product/browser/release admission.

## Scope

- Validate the static route matrix for `/`, `/another_brain_chat`, `/another_brain_chat/`, and query-message variants.
- Validate same-origin q4 asset paths, exact runtime tokenizer presence, q4 shard readability, and the real q4 forward smoke through the existing R28RT1 local Node harness.
- Validate that boot self-check stays quick/non-blocking and that the manual deep self-check can be cancelled and recovered.
- Validate repeated send protection, worker lifecycle constraints, fast identity/greeting routes, and deterministic fallback recovery.
- Write the local runtime report to `artifacts/r28stab0/reports/runtime_soak_report.json`.

## Commands

```bash
npm run test:r28stab0
python3 scripts/r28stab0_static_route_matrix.py
python3 scripts/r28stab0_runtime_soak.py
```

The full pre-merge local gate also runs the inherited R28/R27 static checks, build checks, training-boundary checks, and git whitespace checks listed in the R28STAB0 task.

## Report Schema

`scripts/r28stab0_runtime_soak.py` writes:

```json
{
  "routes_passed": true,
  "self_check_nonblocking": true,
  "self_check_timeout_recovery": true,
  "q4_assets_fetch": true,
  "q4_forward_pass": true,
  "tokens_generated_min": 1,
  "identity_route_fast": true,
  "greeting_route_fast": true,
  "fallback_recovery": true,
  "console_fatal_errors": 0,
  "ui_freeze_detected": false,
  "open_blockers": []
}
```

Extra fields include route latency, q4 asset details, q4 forward smoke output, fallback routes, source health checks, and non-claims.
