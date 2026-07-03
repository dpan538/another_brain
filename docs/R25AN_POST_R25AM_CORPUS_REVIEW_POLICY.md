# R25AN Post-R25AM Corpus Review Policy

R25AN reviews the R25AM-expanded tracked corpus, Chinese-first sampler feasibility, and one tokenizer dry-run readiness pass. It does not authorize decoder training, small-pilot training, product training, release checkpoint admission, or phase_4 scaled training.

## Scope

- Review all tracked JSONL corpus files under `training/llm_corpus/`.
- Include R25AK and R25AM reviewed repo-derived rows.
- Preserve existing corpus files unchanged.
- Run one tokenizer dry-run under ignored artifacts.
- Simulate zh-first sampler plans without writing training datasets.

## Forbidden Surfaces

R25AN does not use evals as training data, does not read `private_sources/`, does not parse root PDFs/DOCX, and does not parse `data/public_ingestion/`. Tokenizer artifacts, model weights, and ignored reports must not be committed.

## Future Boundary

R25AM improved the Chinese-first direction, but the combined full corpus can still remain below zh >= 70% under uniform sampling. Any future R25AO micro-cycle needs fresh explicit approval and must use a zh-first sampler or more reviewed Chinese-personal rows. Phase_4 remains blocked.
