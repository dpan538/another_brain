# R25L Small Decoder Pilot Plan

R25L adds a plan for a future `phase_3_small_decoder_pilot`, but it does not
run the pilot.

The small decoder pilot config is intentionally disabled by default:

- `training_allowed_by_default: false`
- `requires_approval_marker: true`
- `commit_weights_allowed: false`
- output under ignored `artifacts/training_os/small_decoder_pilot/`
- `product_model: false`

`npm run plan:small-decoder-pilot` estimates parameter count, fp32/q8/q4
storage, context-token risk, data size, and static capacity fit. It writes a
planning report only. `npm run run:small-decoder-pilot` skips by default with
`explicit_phase_3_approval_required`.

This pilot plan is not product progress, not a benchmark, and not a browser
release. No weights are written or committed. Any later pilot run would need a
separate reviewer approval marker and must check held-out, recovery, capacity,
privacy, and R24/R25 gates before and after the run.

R25M supplies that narrow reviewer approval for one bounded run only. The run
still writes ignored artifacts only, does not authorize long-term or
product-scale training, does not authorize static release admission, and does
not permit committing checkpoint or tokenizer artifacts.
