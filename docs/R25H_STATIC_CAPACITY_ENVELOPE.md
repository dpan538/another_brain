# R25H Static Capacity Envelope

R25H quantifies the static decoder artifact envelope without selecting a named
model, admitting an artifact, downloading weights, or training. It keeps R25
model-agnostic while making future candidate decisions measurable.

## Current State

- No named model is selected.
- No replacement named candidate is introduced.
- No production artifact is admitted.
- No real model weights are committed.
- No training is run.
- R25 remains a same-origin static browser decoder LLM architecture.
- R24 remains fallback, verifier, and recovery harness.

## Static Profiles

The project policy is encoded in `static_llm/capacity_profiles/profiles.json`.

- `hobby_static_llm_lite`: up to `95,000,000` LLM asset bytes. This is a
  constrained fallback or rejection profile for many realistic decoder
  artifacts.
- `pro_static_llm_full`: up to `950,000,000` LLM asset bytes. This is the
  primary profile for future reviewed static decoder artifacts.

Shared constraints:

- target shard size: `32,000,000` bytes
- hard max shard size: `64,000,000` bytes
- source file count target: `< 15,000`
- build time target: `< 45 minutes`
- same-origin assets only
- no backend inference
- no external storage product
- no external model API

## Scenario Envelope

`static_llm/capacity_profiles/scenarios.json` contains model-agnostic
hypothetical envelopes:

- `tiny_fixture_only`
- `small_decoder_100mb`
- `medium_decoder_300mb`
- `large_decoder_600mb`
- `upper_pro_decoder_900mb`
- `over_budget_decoder_1100mb`

Expected classification:

- `tiny_fixture_only` fits both profiles but is not a model performance claim.
- `small_decoder_100mb` rejects Hobby and fits Pro.
- `medium_decoder_300mb`, `large_decoder_600mb`, and
  `upper_pro_decoder_900mb` fit Pro but carry increasing browser memory,
  storage, cache, and WebGPU risk.
- `over_budget_decoder_1100mb` must reject Pro.

## Dry-Run Manifests

`npm run generate:static-llm-dryrun-manifests` writes metadata-only manifests
under `static_llm/manifests/dryrun/`.

These manifests:

- use `review_status: "dry_run"`
- use `admission_status: "dry_run_not_admitted"`
- contain synthetic asset plans only
- use placeholder hashes marked as dry-run only
- do not create asset files
- cannot be production admitted

Dry-run manifests are for budget and planning gates. They are not reviewed
artifacts, not real model files, and not runtime-ready.

## Browser Memory And Storage

`npm run eval:static-llm-browser-memory-envelope` estimates browser-side risk
from static sizes only. It does not run a browser benchmark or claim real
first-token performance. Larger envelopes should be treated as WebGPU-required
unless a reviewed backend proves otherwise. WASM fallback remains degraded or
possibly unsupported for large decoders.

## Future Candidate Requirements

A future reviewed candidate must provide:

- real total asset bytes
- real tokenizer and config sizes
- real shard count and largest shard size
- real backend-ready format or reviewed conversion path
- same-origin relative asset paths
- real sha256 hashes
- reviewed license and provenance
- browser memory/cache risk review
- R24/R25 gate review

Capacity review does not replace R25E artifact admission. It only tells a
future candidate decision what size and shard envelope it must satisfy before
local artifact intake.
