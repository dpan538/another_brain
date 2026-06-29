# R25C Browser Storage And Load Plan

This plan is for a future admitted same-origin static decoder artifact. R25C
does not claim real model performance.

Load sequence:

1. Load the static LLM manifest from same-origin static files.
2. Validate profile, review status, same-origin paths, no backend requirement,
   and no external storage dependency.
3. Fetch tokenizer and config before selecting model shards.
4. Select model shard files according to manifest order and browser capability.
5. Verify sha256 for each immutable chunk before use.
6. Store immutable verified chunks in browser-local CacheStorage where
   available.
7. Leave IndexedDB or OPFS as future hooks for large local cache management.
8. Detect memory pressure, storage quota, WebGPU support, and cache failures.
9. Report a user-visible disabled or degraded status if capability is
   insufficient.

No server session state is required. No Vercel Blob, KV, Postgres, Redis,
AI Gateway, hosted vector store, remote model API, or third-party model hosting
is allowed for model loading.

The draft path stays disabled until a production manifest is admitted and a
browser inference backend is bound.

R25D binds the backend interface and worker shell, but keeps the production
draft path disabled unless an admitted manifest and real backend pass the
first-token gate. The fixture path may test cache, sha, tokenizer/config, and
worker plumbing only.
