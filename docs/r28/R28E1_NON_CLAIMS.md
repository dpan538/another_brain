# R28E1 Non-Claims

R28E1 is an automated prelaunch smoke and acceptance matrix only.

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

## Explicit Exclusions

This pass does not train, download remote model weights, commit model assets, connect backend inference, connect an external LLM, connect Doubao, connect a hosted vector store, or admit a product/browser/release path.

The matrix can report synthetic draft behavior, fallback behavior, metadata-bound candidate status, and product-path-candidate-not-admitted status. Those are prelaunch status markers only.

## Artifact Boundary

R28E1 adds scripts, tests, and docs. It does not add tracked weights, tokenizer files, exported shards, root DOCX/PDF parses, `data/public_ingestion` content, or private adapter/context/evidence packet samples.
