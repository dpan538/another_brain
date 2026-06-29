# R25G Model-Agnostic Candidate Decision

R25G defines how a future static decoder candidate is reviewed before local
artifact intake. It does not select a named model, introduce a replacement
candidate, download weights, train, or admit assets.

## Current State

- No named model is selected.
- No production static decoder artifact is admitted.
- No real weights are committed.
- Candidate selection is pending a reviewed decision record.
- R25 remains a same-origin static browser decoder LLM architecture.
- R24 remains fallback, verifier, and recovery harness.

## Decision Before Artifact Admission

A future candidate must first have a decision record under
`static_llm/candidate_decisions/decisions/`. The record captures architecture,
parameter count, expected quantization, expected profile, browser backend
format, license, provenance, conversion path, reviewer, and gate expectations.

The decision record does not admit weights. It only says a candidate is ready
for local artifact intake. R25E still needs artifact metadata, local files,
manifest hashes, static budget pass, no-backend checks, backend-format checks,
first-token checks where possible, and R24/R25 gates.

## Required Companion Inputs

- `static_llm/candidate_decisions/schema.json`
- `static_llm/conversion_paths/matrix.json`
- `static_llm/request_pack/`
- local artifact files supplied by the user under
  `static_llm/inbox/browser_decoder_candidate_tbd/`

Codex must not download remote weights or call a remote model API to fill these
inputs.

## Rejection Rules

- Encoder-only candidates cannot be selected for the product path.
- Server-required candidates cannot be selected.
- SLM or 100M-200M final-product targets cannot be selected.
- Candidates requiring Vercel Functions, Edge Functions, external storage,
  hosted vector stores, or remote model APIs cannot be selected.
- Candidate records with placeholder values, missing reviewer, missing
  license/provenance, private paths, secrets, or chain-of-thought markers fail
  validation.
- The purged prior candidate must not return.

## Gate

`npm run check:r25g-candidate-decision` keeps the repository in the correct
model-agnostic state:

- removed-candidate purge still passes
- no active named model candidate exists
- candidate decision schema and template validate
- conversion path matrix validates
- candidate matrix remains generic
- R25F/R25E/R25D/R25C/R25B/R25A and R24 recovery gates remain green

With no real decision files, the expected status is
`awaiting_candidate_decision`.
