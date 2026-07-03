# R25AN Tokenizer Readiness Summary

R25AN ran one tokenizer dry-run readiness pass over the R25AM-expanded tracked corpus. This was not decoder training, not small-pilot training, and not a production tokenizer admission.

## Tokenizer Metrics

- Run id: `r25an_r25am_expanded_corpus_tokenizer_dryrun`
- Vocab size: 4096
- Corpus rows: 4160
- Language counts: zh 1956, mixed 1172, en 1032
- Combined zh share: 47.02%
- Dev unknown-token rate: 0%
- Heldout unknown-token rate: 0%
- Chinese segmentation risk: low
- Mixed-language boundary risk: low
- Sampler readiness: sampler_ready_for_bounded_microcycle
- Recommendation: ready_for_future_bounded_microcycle_review

Tokenizer artifacts remain ignored under `artifacts/training_os/tokenizer_dryrun/r25an//` and are not committed. Future R25AO micro-cycle work requires fresh explicit approval.
