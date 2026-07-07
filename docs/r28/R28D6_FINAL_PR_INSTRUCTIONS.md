# R28D6 Final PR Instructions

R28D6 is the final Vercel preview and main merge candidate branch. It is based on `origin/r28ad0-admission-precheck`.

Manual PR target:

- base: `main`
- head: `r28d6-final-vercel-preview-candidate`
- URL: `https://github.com/dpan538/another_brain/pull/new/r28d6-final-vercel-preview-candidate`

Required local checks before opening or updating the PR:

```bash
npm run build
npm run build:vercel
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
npm run check:training-approval-markers
python3 scripts/r27b4_bundle_report.py
python3 scripts/r28ad0_admission_precheck.py
python3 scripts/r28qa1_run_qa_matrix.py
git diff --check
git diff --cached --check
git show --check HEAD
```

Current candidate summary:

- static q4 assets committed under the R28M1 same-origin path
- RT2 readable q4 runtime smoke passed
- QA1 matrix passed `24/24`
- AD0 hard preconditions passed
- deployable static bytes: `68,984,504`
- 100MB margin: `31,015,496`
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store

Merge discipline:

- Do not merge main automatically.
- Do not approve product admission in this PR.
- Do not approve browser admission in this PR.
- Do not approve release checkpoint admission in this PR.
- Treat this as a Vercel preview candidate until preview validation and manual QA are completed.
