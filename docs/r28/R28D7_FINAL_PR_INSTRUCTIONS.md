# R28D7 Final PR Instructions

R28D7 is the final preview PR branch after exact tokenizer, deterministic generation policy, and post-tokenizer product-surface QA hardening.

Manual PR target:

- base: `main`
- head: `r28d7-final-preview-branch`
- URL: `https://github.com/dpan538/another_brain/pull/new/r28d7-final-preview-branch`

Integrated base chain:

- `origin/r28qa2-product-surface-qa`
- includes R28GEN0 deterministic generation policy
- includes R28TOK0 exact runtime tokenizer
- includes R28M1 same-origin q4 static model assets

Required local checks before opening or updating the PR:

```bash
npm run build
npm run build:vercel
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
npm run check:training-approval-markers
python3 scripts/r27b4_bundle_report.py
python3 scripts/r28qa2_product_surface_matrix.py
git diff --check
git diff --cached --check
git show --check HEAD
```

Current preview summary:

- static q4 assets remain committed under `web/another_brain/model_assets/r28m1/`
- exact runtime tokenizer is the primary tokenizer path
- deterministic generation policy and answer-surface finalizer are present
- QA2 product-surface matrix passed `13/13`
- readable q4 generation produced `40` smoke tokens across 5 prompts
- tokenizer decode status: `exact_runtime_tokenizer`
- QA2 labels: `quality_weak`, `preview_ready`, `admission_not_ready`
- deployable static bytes: `69,982,673`
- 100MB margin: `30,017,327`
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store

Preview validation checklist:

- Confirm Vercel preview is built from `r28d7-final-preview-branch`.
- Open `/another_brain_chat/`.
- Confirm local/static status and non-product warning are visible.
- Confirm runtime mode is `static_q4_experimental`.
- Confirm exact tokenizer status is visible or represented in runtime status.
- Confirm generated q4 text can appear, with fallback reason shown when the finalizer blocks output.
- Confirm RAG evidence, insufficient evidence, conflict, and malicious evidence paths remain visible.
- Confirm adapter import remains local-session-only and not training data.
- Confirm network panel has no backend, external LLM, Doubao, or hosted vector store calls.

Merge discipline:

- Do not merge main automatically.
- Do not approve product admission in this PR.
- Do not approve browser admission in this PR.
- Do not approve release checkpoint admission in this PR.
- Treat this branch as a Vercel preview candidate until preview validation and manual QA are completed.
