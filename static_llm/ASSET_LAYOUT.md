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

- Assets must be same-origin static files.
- Production assets must live under `static_llm/assets/` or
  `web/static_llm/assets/`.
- Manifest paths must never point to external URLs.
- Real production files need real sha256 hashes, reviewed license/provenance,
  and R25 budget/admission checks.
- Fixture files under `static_llm/fixtures/` are only for loader smoke tests and
  cannot be admitted as production models.
- R25B adds no real weights and runs no training.

The expected primary future profile is `pro_static_llm_full`; the
`hobby_static_llm_lite` profile is a constrained fallback or comparison target.
