# R25J Tiny Decoder Toy Pipeline

R25J adds the toy decoder pipeline scaffold needed for a future phase 2 sanity
run. The scaffold is intentionally inert by default.

The toy decoder is:

- pipeline mechanics only
- not the product model
- not a benchmark
- not a static browser release artifact
- not evidence that formal decoder training has started

`npm run run:tiny-decoder-toy-overfit` exits successfully with
`skipped: true` unless a later reviewed patch adds and approves an explicit
toy-training flag. R25K is that later reviewed patch: it may run only with the
approval marker and `--allow-toy-training`, and it remains a tiny toy sanity
run for pipeline mechanics only.

R25K toy outputs are ignored artifacts under
`artifacts/training_os/tiny_decoder_toy/`. The toy checkpoint is not a product
model, not a benchmark, not a release candidate, and not a formal training
checkpoint. No toy weights, real weights, or generated tokenizer artifacts are
committed.

R24 remains the verifier, fallback, and recovery harness. R25 static gates
remain release packaging gates for a future self-trained decoder artifact.
