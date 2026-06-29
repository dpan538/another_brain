# R25I Training Phase Plan

Current state: `phase_0_no_training_current`.

Formal training progress remains `0%`. Training-readiness can improve through
schemas, review gates, and dry-run validators, but that is not model training.

| Phase | Entry Criteria | Exit Criteria | Artifacts | Gates | Rollback Triggers |
| --- | --- | --- | --- | --- | --- |
| `phase_0_no_training_current` | R25H capacity envelope green | Doctrine, release-decision schema, architecture/tokenizer/corpus plans exist | Docs and schemas only | R25I/R25H/R24 gates | Any claim that training started or weights exist |
| `phase_1_tokenizer_dry_run` | Reviewed corpus plan and contamination checks green | Local tokenizer dry-run report with held-out tokenization eval | tokenizer reports under ignored artifacts | corpus, contamination, no-private-data, no-CoT gates | eval leakage, private data, unstable normalization |
| `phase_2_tiny_overfit_sanity` | Tokenizer dry-run accepted | Tiny toy decoder proves pipeline mechanics only | ignored toy checkpoint, metrics report | no-weight-commit, training provenance, toy-only label | toy model described as product |
| `phase_3_small_decoder_pilot` | Toy pipeline stable, corpus expanded | Small from-scratch decoder pilot measured against R24/R25 | ignored checkpoint and eval reports | held-out, anti-lobotomy, dialogue, no-backend | regression in recovery or privacy gates |
| `phase_4_scaled_decoder_training` | Pilot passes, capacity plan reviewed | Larger from-scratch model fits Pro static envelope in plan | training run report, checkpoint metadata | R24/R25, capacity, license/provenance | exceeds Pro envelope or fails held-out gates |
| `phase_5_quantize_and_static_release` | Reviewed checkpoint selected for release | Static artifact, manifest, hashes, and release decision pass admission | static release candidate | R25E/R25H, no-unapproved-weights | missing hashes, backend mismatch, budget fail |
| `phase_6_gated_browser_draft` | Real first-token gate passes | Disabled-by-default draft path behind verifier/fallback | runtime flag, browser smoke report | first-token, contract, fallback firewall | fixture output or unsafe draft surfaces |
| `phase_7_long_run_training` | All earlier gates stable | Longer training only with split integrity and route audits green | long-run reports | held-out, route distribution, provenance | overfit, collapse, backend drift |

Commands for later phases must be added only when their entry criteria are met.
R25I adds no training commands.

## Failure Modes To Watch

- Treating external model admission as product model selection.
- Treating LoRA or adapters as the final strategy.
- Expanding answer banks instead of training a general decoder.
- Allowing eval prompts into training.
- Claiming first-token success from fixture output.
- Weakening R24 recovery gates to make a model appear better.
