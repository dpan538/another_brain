# R25K Toy Overfit Sanity

R25K is a reviewer-approved tiny toy overfit sanity check for
`phase_2_tiny_overfit_sanity`. It may run only when
`training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json` is present and the
`--allow-toy-training` flag is passed.

This is not formal decoder LLM training, long-term training, product model
training, a browser release artifact, or proof of real model intelligence.

The R25K toy path:

- rebuilds the R25J tokenizer dry-run artifacts
- builds a tiny deterministic toy dataset from `training/llm_corpus/train.jsonl`
- extracts only `messages`, `constraints`, and `target_answer`
- initializes a tiny from-scratch trainable bigram next-token toy
- runs a short bounded overfit loop
- writes checkpoint, metrics, and report files only under ignored
  `artifacts/training_os/tiny_decoder_toy/`

The toy checkpoint is ignored and must not be committed. No real weights are
committed, no generated tokenizer artifacts are committed, and no named
pretrained model is selected.

Loss decrease only proves that tokenizer, dataset, toy initialization, update,
and reporting mechanics can run locally. It is not a benchmark and it does not
make the toy model a product candidate.

Formal training progress remains `0%`. Training-readiness may increase
conservatively after the toy eval and artifact guards pass. Browser product
completion should not materially increase because no browser product model
exists yet.

R25L builds on this by expanding corpus rows and planning a small decoder
pilot. R25L does not run the small pilot, does not write pilot weights, and does
not make the R25K toy checkpoint a product or release artifact.

R25N consumes the R25K one-shot approval marker after commit
`0a3b5a65f4a28e09aed66aa2cd722608a2b377ba`. Routine gates must validate R25K
history without rerunning toy training. Any future toy run needs a fresh
approval marker.
