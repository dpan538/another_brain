# R27B1C 48H Delivery Checklist

## Training Line Status

- Record R27A6/R27A7 checkpoint status from the A line without reading or committing artifacts in B-line work.
- Record best checkpoint path only after the training line publishes safe metadata.
- Record dialogue readiness as reported by A-line gates.
- Record 100MB browser budget estimate before any real model package is considered.

## Browser Line Status

- B0 shell: static chat window, local-only badge, no-backend badge, status strip, debug toggle, same-origin manifest, 100MB budget gate.
- B1A export/quantization: interface and shard format exist; generated exports stay ignored local artifacts.
- B1B runtime: browser runtime loader, worker generation loop, synthetic tiny mode, same-origin shard loader, verifier/fallback pipeline.
- B1C deploy rehearsal: static bundle checks, route smoke, Vercel static safety, asset packaging policy, delivery checklist.

## Minimum Deliverable

- Static chat window at `/another_brain_chat/`.
- Local mock or synthetic runtime.
- Candidate model injection path documented.
- RAG packet interface.
- Verifier/fallback wrapper.
- No backend inference.

## Product-Candidate Requirements Before Real Model

- Quantized model fits the browser budget.
- Tokenizer fits the tokenizer budget.
- Static same-origin load works.
- Local generation works in browser smoke.
- RAG packet works.
- Safety gates pass.
- Dialogue readiness is `weak_candidate` or better.

## Hard Non-Claims

- No product model until admission.
- No phase_4 claim from B-line rehearsal.
- No release checkpoint until explicit admission.
- No backend inference.
- No external LLM API.
- No Doubao integration.
- No hosted vector store.
