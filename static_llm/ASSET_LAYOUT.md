# Static LLM Asset Layout

R25B keeps real model weights out of the repository. The target layout for a
future admitted static decoder LLM is:

```text
static_llm/
  manifests/
    <model-id>.json
  assets/
    <model-id>/
      config.json
      tokenizer.json
      model-00001.<reviewed-format>
      model-00002.<reviewed-format>
  tools/
    conversion and verification notes only
```

Rules:

- R25C local intake happens under `static_llm/inbox/` or
  `static_llm/models_staging/`; real files there remain ignored and unstaged by
  default.
- Assets must be same-origin static files.
- Production assets must live under `static_llm/assets/` or
  `web/static_llm/assets/`.
- Manifest paths must never point to external URLs.
- Real production files need real sha256 hashes, reviewed license/provenance,
  and R25 budget/admission checks.
- Fixture files under `static_llm/fixtures/` are only for loader smoke tests and
  cannot be admitted as production models.
- R25C may inspect a local artifact and generate dry-run reports, but it adds
  no real weights by default and runs no training.
- R25D adds worker/backend and first-token smoke scaffolding. The fixture
  backend is not a production model and cannot be admitted.
- R25E admission attempts read local candidates only from `static_llm/inbox/`
  or `static_llm/models_staging/`. Asset copying is dry-run by default and
  requires a candidate-local approval marker before any real staging; git
  staging remains a separate reviewed step.
- R25F resets model selection to generic reviewed decoder artifact paths. Do
  not use a named model path until a later reviewed decision selects one.
- R25G requires a candidate decision record and conversion path review before a
  local artifact intake attempt. The decision record does not admit weights.
- R25H adds `static_llm/capacity_profiles/` and
  `static_llm/manifests/dryrun/` for metadata-only capacity planning. Dry-run
  manifests are non-production and cannot be admitted.

The expected primary future profile is `pro_static_llm_full`; the
`hobby_static_llm_lite` profile is a constrained fallback or comparison target.
