# Static LLM Assets

R25A prepares the repository for a future same-origin browser decoder LLM. It does
not admit or ship model weights.

The intended deployment shape is:

```text
Vercel static hosting
  -> /static_llm/manifest.json
  -> /static_llm/assets/... sharded model files
  -> browser cache/storage
  -> browser-side inference
```

No server-side inference, external model API, hosted vector store, Vercel
Functions inference, Edge Functions inference, Blob, KV, Postgres, Redis, or AI
Gateway path is allowed for model loading.

## Files

- `llm_manifest.schema.json`: schema for a reviewed static LLM manifest.
- `example_manifest.hobby.json`: placeholder manifest for the
  `hobby_static_llm_lite` profile.
- `example_manifest.pro.json`: placeholder manifest for the
  `pro_static_llm_full` profile.

Example manifests are not admitted models. They use explicit
`example_*_DO_NOT_ADMIT` hashes so admission checks can reject them if they are
ever treated as real assets.

## Admission Rule

A real R25B-or-later model must pass:

```bash
npm run check:static-llm-manifest
npm run check:static-llm-budget
npm run check:no-backend-llm
npm run eval:r25-static-llm-admission
```

Model assets are banned everywhere by default. They are allowed only under the
approved static LLM asset path, with same-origin manifest entries, reviewed
license/provenance, real sha256 hashes, and a profile budget pass.
