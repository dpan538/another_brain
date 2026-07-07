# R27B4 Delivery Candidate Checklist

- Static chat route exists: `/another_brain_chat/`.
- Same-origin asset policy is active.
- No backend inference route is introduced.
- No external LLM endpoint is introduced.
- Static demo RAG packet path is wired.
- Verifier/fallback path is wired.
- Candidate model injection path exists through B2 ignored assets.
- Export and quantization bridge exists through B1A/B2 scripts.
- Static budget is under 100MB.
- Vercel static build passes.

Remaining blockers before a real product candidate:

- Real candidate quality evaluation.
- Quantized candidate asset admission.
- Final model card.
- Final product admission.
- R28 wrapper if needed.
- Explicit release decision.
