# Browser Inference Stack Options

another_brain can support several local inference stacks, but the public runtime must remain no-cloud and verifier-gated.

## Stack Summary

| Option | Best Use | Public Default |
| --- | --- | --- |
| deterministic runtime | exact rules, solvers, privacy/copyright boundaries | yes |
| WASM fallback adapter | controlled gate/verifier/embedding when WebGPU is absent | yes, if artifact passes validators |
| ONNX Runtime Web with WebGPU EP | gate/verifier/embedding acceleration | candidate |
| Transformers.js | browser-friendly encoder/classifier/embedding models | candidate |
| WebLLM | compact decoder or chat-style local model | experimental only |
| WebNN | future browser ML acceleration | watchlist |

## Selection Criteria

- no cloud inference;
- verified model/data license;
- no private raw data in weights or cache;
- no PDF/docx/raw source snippets in weights or cache;
- 3s loaded-page answer SLA;
- safe WASM/CPU fallback;
- verifier, solver, privacy, copyright, and source rules cannot be dropped;
- model output is advisory unless explicitly verifier-approved.

## Recommended R17 Path

1. Keep deterministic lite/standard runtime as the stable default.
2. Use adapters to measure WebGPU/WASM capability without committing weights.
3. Prefer classifier, verifier, embedding, and rerank models before any generator.
4. Treat 100M-200M personal profile as optional and disabled unless benchmark, license, size, and fallback checks pass.
5. Store metrics and capability reports under `artifacts/training_os/`.

## Cache Policy

Approved local model artifacts may use OPFS, Cache API, or IndexedDB when available. Session memory remains session-scoped and must not be written into model caches.
