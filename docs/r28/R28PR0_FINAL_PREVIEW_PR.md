# R28PR0 Final Preview PR

R28PR0 creates a wrapper preview branch and PR for the safest static preview candidate. It does not train, change model assets, add backend inference, or approve product/browser/release admission.

## Selected Source Branch

- Selected source branch: `origin/r28rout0-hard-router-answer-surface`
- Selection reason: R28ROUT0 exists and its selection gates passed locally.
- Fallback source if ROUT0 fails or is absent: `origin/r28d7-final-preview-branch`
- Wrapper branch: `r28pr0-final-preview-pr`
- PR base: `main`

## Runtime And Assets

- Runtime mode: `static_q4_experimental`
- Q4 static assets: present from selected source branch
- Exact tokenizer: present as `exact_runtime_tokenizer`
- Static decoder path: browser static q4 draft path preserved
- Hard router: present from R28ROUT0
- Backend inference: false
- External LLM API: false
- Doubao: false
- Hosted vector store: false

## Bundle Budget

- Model asset bytes: `48,267,968`
- Bundle report model declared bytes: `48,306,593`
- Bundle report build output bytes: `20,676,178`
- Full bundle estimate: `69,982,704` bytes
- Full static bundle estimate: `98,385,593` bytes
- Max shard bytes: `12,000,000`
- Budget limit: `100,000,000` bytes
- Bundle report margin: `79,323,822` bytes under 100MB
- Full bundle margin: `30,017,296` bytes under 100MB
- Full static bundle margin: `1,614,407` bytes under 100MB

## Build And Gate Status

R28PR0 requires these wrapper-branch gates before PR creation or confirmation:

- `npm run test:r28pr0`
- `npm run test:r28rout0` when present
- `npm run test:r28d7` when present
- `npm run test:r28qa2` when present
- `npm run test:r28gen1` when present
- `npm run test:r28tok1` when present
- `npm run test:r28rt2` when present
- `npm run test:r28m1`
- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`
- `npm run check:no-training-in-routine-gates`
- `npm run check:training-approval-markers`
- `python3 scripts/r27b4_bundle_report.py`

Missing optional test scripts are recorded as `missing_optional_script` and do not block the wrapper as long as build, static-only, budget, and no-training gates pass.

## Release Blockers

- Product admission not done.
- Browser admission not done.
- Release checkpoint admission not done.
- Vercel preview must pass before release use.
- Quality status is `quality_not_ready` until manual QA/admission work changes it.
- `phase_4` remains false.

## Non-Claims

- This is not product model admission.
- This is not browser admission.
- This is not release checkpoint admission.
- This is not a product model claim.
- This does not add backend inference.
- This does not add external LLM API use.
- This does not add Doubao.
- This does not add a hosted vector store.
- This does not train or approve training.
- This does not automatically merge the PR.
