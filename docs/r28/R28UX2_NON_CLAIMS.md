# R28UX2 Non-Claims

R28UX2 is a frontend polish pass for the static chat shell only.

It does not claim:

- product model
- product admission
- browser admission
- release admission
- backend inference
- Vercel Function inference
- Edge inference
- external LLM API
- Doubao integration
- hosted vector store
- committed model assets
- committed tokenizer assets
- committed exported shards
- training data promotion
- adapter payload persistence
- context packet persistence
- evidence packet persistence

## Explicit exclusions

This pass does not train, download remote model weights, connect backend inference, connect external LLM APIs, connect Doubao, connect a hosted vector store, or admit a product/browser/release path.

The static UI can show a prelaunch route, fallback reason, metadata-bound candidate route, or product-path-candidate-not-admitted marker. Those are status markers only, not product admission.

## Artifact boundary

R28UX2 adds UI, tests, and docs only. It does not add tracked model weights, tokenizer files, exported shards, raw/clean training samples, public-ingestion data, root document parses, or adapter/context/evidence payload samples.
