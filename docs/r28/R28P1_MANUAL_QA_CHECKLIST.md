# R28P1 Manual QA Checklist

Manual QA should verify the demo package exactly as a static prelaunch candidate.

- Static chat shell loads at `/another_brain_chat/`.
- `Local only` badge is visible.
- `No backend inference` badge is visible.
- Delivery mode remains `demo_static`.
- Model mode is metadata/candidate manifest only.
- RAG mode remains `static_demo`.
- Non-product warning is visible.
- Candidate route is visible and says `product_path_engineering_candidate`.
- Release blockers are visible.
- A Chinese prompt returns a static demo answer.
- Evidence drawer shows local/static evidence packet behavior.
- Insufficient evidence still falls back honestly.
- Local context import works for a valid packet.
- Invalid local context import is rejected.
- Context clear removes imported local-session packets.
- Asset cache status does not claim real model assets.
- Browser reload works without backend inference.
- Mobile viewport does not hide the warning, candidate status, or blocker status.
- No external LLM/API/OAuth/backend request is introduced.
- Vercel preview URL still needs to pass after push.

Pass criteria: all static-demo behaviors above pass, while product/browser/release admissions remain explicitly unclaimed.
