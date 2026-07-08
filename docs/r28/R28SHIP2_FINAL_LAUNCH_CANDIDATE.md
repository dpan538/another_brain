# R28SHIP2 Final Launch Candidate

Branch:

- `r28ship2-final-launch-candidate`

Candidate contents:

- QA6 no-hang/open-question runtime lineage.
- SHIP0 q4 mount and retry-before-fallback path.
- UX5 Chat/Dashboard split.
- SURF5 natural answer surfaces and length policy.
- LOAD0 model loading state-machine compatibility.
- static/local RAG profile pack.
- R28M1 q4 static assets from main.

A13 status:

- evidence only.
- not admitted.
- does not replace R28M1 static assets.

Final gate:

- `npm run test:r28ship2`: passed.
- `python3 scripts/r28ship2_branch_inventory.py`: passed, 13 branches scanned.
- `python3 scripts/r28ship2_final_qa_matrix.py`: passed, 12/12 scenarios.
- `npm run test:r28qa6`: passed.
- `npm run test:r28hotfix4`: passed.
- `npm run test:r28ux5`: passed.
- `npm run test:r28rout1`: passed.
- `npm run test:r28surf5`: passed.
- `npm run test:r28rag3`: passed.
- `npm run test:r28load0`: passed.
- `npm run build`: passed.
- `npm run build:vercel`: passed.
- `npm run check:r27b0-static-budget`: passed.
- `npm run check:r27b0-static-only`: passed.
- `npm run check:no-training-in-routine-gates`: passed.
- `npm run check:training-approval-markers`: passed.
- `npm run check:no-eval-hardcoding`: passed.
- `python3 scripts/r27b4_bundle_report.py`: passed.

Bundle evidence:

- `build_output_bytes`: 20908304.
- `max_total_static_bytes`: 100000000.
- `margin_bytes`: 79091696.
- `model_declared_bytes`: 48306593.
- `tokenizer_declared_bytes`: 998388.
- `rag_asset_bytes`: 9045.

Final decision:

- `merge_ready` for code merge after manual PR review.
- No automatic merge to `main` was performed.
