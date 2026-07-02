# R25AC Chinese Personal Micro-Cycle Run

R25AC is one bounded Chinese-first personal micro-cycle, approved by a fresh
reviewer marker and consumed after one attempt. It is not product-scale
training, not long-term training, not phase_4 scaled training, not release
checkpoint admission, and not a browser static artifact.

## Scope

- Run id: `r25ac_chinese_personal_microcycle_256`.
- Basis pilot: `r25s_data_first_balanced_192`.
- Architecture: one-layer `causal_decoder_pilot`, not the R25V two-layer
  ablation.
- Train source: `training/llm_corpus/r25l_train.jsonl`.
- Dev source: `training/llm_corpus/r25l_dev.jsonl`.
- Held-out source: `training/llm_corpus/r25l_heldout.jsonl` for replay
  evaluation only.
- Output root: `artifacts/training_os/small_decoder_pilot/r25ac/`.

## Chinese-First Direction

R25AC samples R25L rows toward the R25AB target:

- `zh`: at least `70%`.
- `mixed zh/en`: about `20%`.
- `en`: at most `10%`.

English remains secondary and supportive. It is used for code terms, technical
configuration, package names, and bilingual robustness; it must not dominate
the training corpus.

## Personal Color Boundary

R25AC personal color is structural and reviewed. It may use project-authored
style examples, project decision history, observable constraints, and Chinese
tone examples already represented by R25L labels. It must not use raw private
memory, root PDFs/DOCX, `data/public_ingestion/`, hidden prompts,
chain-of-thought data, local private paths, secrets, exact eval prompt copies,
or unreviewed personal documents.

The target is a healthy Chinese-first personal model, not a perfect GPT clone
or a generic benchmark-optimization machine. Project-trained and self-trained
do not mean project reset: all R24/R25 gates, datasets, pilots, and decisions
remain part of the system.

## Completion Boundary

After the one-shot attempt, the approval marker must be consumed and active
training approvals must return to `0`. A good loss does not authorize another
run, phase_4 scaled training, product training, release admission, committed
weights, backend inference, storage, API routes, or third-party hosting.

Product training progress remains `0%`. Formal decoder training progress
remains `0%`. Pilot progress may rise only as a bounded phase 3 pilot signal.
