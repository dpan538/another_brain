# R25D Browser Inference Binding

R25D adds the browser-side backend interface and worker shell for the future
same-origin static decoder LLM path. It does not train, download, admit, or
commit real model weights.

## Runtime Shape

- `web/static_llm_backend.js` defines the backend interface.
- `web/static_llm_worker.js` moves future initialization and decode work off
  the main UI thread.
- `web/static_llm_worker_client.js` provides a non-blocking browser client.
- `web/static_llm_tokenizer.js` loads tokenizer/config metadata and supports
  only the tiny fixture tokenizer deterministically.
- `web/static_llm_runtime.js` resolves same-origin asset URLs, verifies sha256,
  loads tokenizer/config, and reports model shard headers without loading large
  shards by default.

The fixture backend may emit a deterministic token for smoke tests. WebGPU and
WASM production backends are explicit stubs until a reviewed artifact and real
browser inference binding exist.

## Boundaries

R25D keeps the production answer path disabled by default. The main product
target remains a static browser decoder LLM wrapped by the R24 verifier,
finalizer, and fallback firewall, but no draft may surface from the fixture in
the production UI.

No Vercel Function, Edge Function, API route, external model API, Blob, KV,
Postgres, Redis, AI Gateway, hosted vector store, or third-party model hosting
is allowed for model loading or inference.

## Blocked Mode

When no admitted manifest exists, R25D should pass in blocked mode:

- fixture backend first-token smoke passes
- production backend reports unavailable
- real first-token smoke is skipped with `no_admitted_static_llm_manifest`
- no fake production success is reported

The remaining input for R25E is a reviewed local decoder artifact admitted by
the R25C gate.

R25E may inspect approved local inbox artifacts, but raw checkpoints are not
automatically browser-runnable. Real first-token success requires a production
manifest plus a real backend binding; the R25D WebGPU/WASM classes remain stubs
until that binding exists.

R25F leaves this backend shape model-agnostic. No named decoder candidate is
selected by the backend layer.

R25H capacity dry-runs are not backend support. They only estimate static
asset, shard, browser memory, and cache pressure before a future reviewed
artifact exists.
