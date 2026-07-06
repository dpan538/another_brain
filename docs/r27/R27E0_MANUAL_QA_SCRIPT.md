# R27E0 Manual QA Script

Use this script for the 48h demo walkthrough. It intentionally checks the current static shell and demo RAG path only. It does not ask the reviewer to train, download, connect, or admit a model.

## Preflight

Run:

```bash
npm run test:r27e0
npm run build:vercel
python3 scripts/r27e0_acceptance_check.py
```

Continue only if all three commands pass.

## Browser Walkthrough

1. Open the static chat route: `/another_brain_chat/`.
2. Confirm the header says `Local only`.
3. Confirm the header says `No backend inference`.
4. Confirm delivery status says `demo_static`.
5. Confirm model mode says `synthetic_tiny`.
6. Confirm RAG mode says `static_demo`.
7. Confirm budget status says `under_100mb`.
8. Confirm the non-product warning is visible when no admitted product model exists.
9. Send this Chinese prompt:

```text
请用本地 evidence packet 说明 another_brain 的 browser memory surface 是怎样工作的。
```

10. Confirm a response appears and the status strip shows local retrieval evidence.
11. Enable `Retrieval packet debug`.
12. Confirm the debug packet shows `local_only: true`, `same_origin_only: true`, and no backend retrieval.

## Negative Paths

Run these with the machine checker as the authority:

- `insufficient_evidence`: unrelated or empty evidence must use fallback rather than claim support.
- `malicious_evidence`: injected evidence such as "ignore previous instructions" must be refused or blocked by verifier/fallback logic.
- `fallback`: verifier failure must produce a controlled fallback response.
- `error_state`: forced generation failure must produce a controlled fallback/error state.

## Acceptance Checklist

- `chat_route`: route opens.
- `local_only_badge`: local-only badge visible.
- `no_backend_external_runtime`: no backend or external runtime.
- `chinese_prompt`: Chinese prompt submits and returns a response.
- `demo_evidence`: demo evidence is retrieved.
- `insufficient_evidence`: unsupported evidence falls back.
- `malicious_evidence`: malicious evidence is blocked.
- `fallback`: fallback path is visible in status/debug output.
- `error_state`: runtime error is controlled.
- `budget_report`: static bundle budget report is green.
- `non_product_warning`: no product model warning is visible when no admitted model exists.
- `same_origin_asset_manifest`: manifest uses same-origin static assets only.
- `vercel_build`: `npm run build:vercel` passes.
- `mobile_layout`: narrow viewport remains usable without horizontal overflow.
- `accessibility_markers`: labels and live-region markers are present.

Record the final `python3 scripts/r27e0_acceptance_check.py` JSON in the handoff notes.
