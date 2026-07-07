# R28D5 Final Prelaunch Audit

R28D5 selects `origin/r28rt1-real-q4-forward` as the final prelaunch PR base because RT1 produces real committed-q4 token ids without backend or external inference.

Audit command:

```bash
python3 scripts/r28d5_final_prelaunch_audit.py
```

The audit verifies q4 static assets, shard checksums, bundle budget, static-only runtime boundaries, chat/RAG/adapter/cache routes, fallback availability, RT1 real-forward status, release blockers, and non-claims.

Expected result for the D5 candidate:

- q4 assets: present under `web/another_brain/model_assets/r28m1/`
- shard count: 5
- max shard bytes: 12,000,000
- full deployable static bytes: 68,977,993
- real forward: `static_q4_experimental` token-id smoke passed
- product admission: false
- browser admission: false
- release checkpoint admission: false
