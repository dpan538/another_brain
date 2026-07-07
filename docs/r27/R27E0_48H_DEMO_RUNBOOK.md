# R27E0 48h Demo Runbook

R27E0 is a demo QA and acceptance harness for the current static browser delivery path. It does not train, export, quantize, admit, or load a product model. It exercises the existing static shell, static RAG fixture, runtime packet flow, bundle budget, and future-candidate guardrails so a 48h handoff can be repeated without guessing.

## Scope

- Demo route: `web/another_brain_chat/index.html`.
- Runtime config: `web/another_brain/runtime_mode.json`.
- Static asset manifest: `web/another_brain/asset_manifest.json`.
- Static RAG fixture: `web/another_brain/static_rag/demo_memory.json`.
- Machine acceptance: `python3 scripts/r27e0_acceptance_check.py`.
- Unit gate: `npm run test:r27e0`.

Out of scope: training, live teacher calls, backend inference, hosted vector stores, external model URLs, model admission, release checkpoint claims, and Phase 4 product claims.

## 48h Acceptance Order

Run these commands from the repository root:

```bash
npm run test:r27e0
npm run build:vercel
python3 scripts/r27e0_acceptance_check.py
git diff --check
git diff --cached --check
git show --check HEAD
```

The first three commands are the R27E0 acceptance suite. The final three keep whitespace and commit metadata clean before handoff.

## Demo Setup

1. Serve the static `web` directory with any local static file server.
2. Open `/another_brain_chat/`.
3. Confirm the header shows `Local only` and `No backend inference`.
4. Confirm the delivery strip shows `demo_static`, `synthetic_tiny`, `static_demo`, and `under_100mb`.
5. Confirm the warning says no product-path candidate is admitted when `product_model` is false.

The demo is acceptable if local static assets are enough to render the route and run the mock packet flow. No network service is required beyond same-origin static file fetches.

## Scenario Map

R27E0 tracks 15 scenarios:

| ID | Scenario | Primary evidence |
| --- | --- | --- |
| `chat_route` | open chat route | route smoke or static shell files |
| `local_only_badge` | local-only badge visible | `#local-indicator` and badge text |
| `no_backend_external_runtime` | no backend/external runtime | static-only gate and config booleans |
| `chinese_prompt` | send Chinese prompt | browser runtime smoke with Chinese input |
| `demo_evidence` | retrieve demo evidence | evidence packet status and source IDs |
| `insufficient_evidence` | insufficient evidence path | empty evidence fallback smoke |
| `malicious_evidence` | malicious evidence path | verifier refusal on injected evidence |
| `fallback` | fallback path | verifier-recommended fallback smoke |
| `error_state` | error state | forced runtime error fallback smoke |
| `budget_report` | budget report | R27B4 bundle report |
| `non_product_warning` | no product model warning if no admitted model | config and UI warning |
| `same_origin_asset_manifest` | same-origin asset manifest | manifest asset path checks |
| `vercel_build` | Vercel build | `build:vercel` wiring plus separate command |
| `mobile_layout` | mobile layout | viewport and responsive CSS markers |
| `accessibility_markers` | accessibility markers | labels, aria-live, and sr-only input label |

## Handoff Result

Attach or paste the JSON output from:

```bash
python3 scripts/r27e0_acceptance_check.py
```

A handoff is green only when `ok` is `true` and all 15 scenario records are `passed`.
