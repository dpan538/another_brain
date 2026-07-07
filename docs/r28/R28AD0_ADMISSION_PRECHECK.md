# R28AD0 Admission Precheck

R28AD0 is a precheck only. It does not approve product admission, browser admission, release checkpoint admission, or phase 4.

Command:

```bash
python3 scripts/r28ad0_admission_precheck.py
```

Current labels:

- `not_ready_quality_blocked`
- `not_ready_preview_blocked`

The candidate has committed static q4 assets, real q4 forward, readable display-codec decode, QA matrix pass, bundle under 100MB, no backend/external runtime, RAG honesty checks, and safety guard checks. It is still not ready to request admission because output quality remains `quality_not_ready` and Vercel preview/manual QA have not been checked.

Manual approvals still required later:

- product admission
- browser admission
- release checkpoint admission

AD0 grants none of them.
