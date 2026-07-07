# R28P1 Release-Candidate Gate

R28P1 is the final local gate for a prelaunch demo package. It answers one narrow question: is the static demo shell, with A12 engineering metadata, ready to be previewed and reviewed without claiming product admission?

Gate command:

```bash
python3 scripts/r28p1_release_candidate_gate.py
```

The gate writes:

```text
artifacts/r28p1/reports/release_candidate_gate.json
```

Checks covered:

- `npm run build` passes.
- `npm run build:vercel` passes.
- Bundle is under 100MB.
- Static-only gate passes.
- No backend inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
- No committed model assets.
- No committed tokenizer artifacts.
- No committed exported shards.
- No product model claim.
- No browser admission claim.
- No release checkpoint claim.
- Chat route smoke.
- RAG demo smoke.
- Adapter bridge smoke.
- Asset cache smoke.
- Non-product warning visible.
- Candidate status visible.
- Release blockers visible.

Passing this gate means the branch is acceptable as a release-candidate demo package. It does not mean the model is a product model, does not admit real browser model runtime assets, and does not approve Phase 4.
