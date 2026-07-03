# R25AL Tokenizer Readiness Summary

R25AL ran one tokenizer dry-run readiness pass over the expanded tracked corpus. This was not decoder training, not small-pilot training, and not a production tokenizer admission.

## Tokenizer Metrics

- Run id: `r25al_expanded_corpus_tokenizer_dryrun`
- Vocab size: 4096
- Corpus rows: 3200
- Language counts: zh 1184, mixed 1028, en 988
- Combined zh share: 37%
- Dev unknown-token rate: 0.02%
- Heldout unknown-token rate: 0%
- Chinese segmentation risk: low
- Mixed-language boundary risk: low
- Recommendation: corpus_needs_more_chinese_rows

Tokenizer artifacts remain ignored under `artifacts/training_os/tokenizer_dryrun/r25al//` and are not committed. Future R25AM training still requires fresh explicit approval.
