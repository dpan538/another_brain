# R25R / R25S Approval Boundary

R25R prepares R25S but does not approve it.

The R25S approval template is safe to commit because it is inert:

- `approved:false`
- `allow_small_pilot_training:false`
- `allow_long_term_training:false`
- `allow_product_model_training:false`
- `allow_release_checkpoint:false`
- `allow_weight_commit:false`

A future R25S run would require a copied approval marker with explicit reviewer
approval, a matching `run_id`, a matching `variant_id`, and the same no-product,
no-release, no-long-term, no-weight-commit boundaries. Consumed R25K, R25M, and
R25P approvals remain invalid for new runs.

R25S is intended to test a bounded data-first pilot only. It is not product
training, not long-term training, not phase 4 scaled training, not release
checkpoint admission, and not browser static deployment.

Routine gates must not invoke approval-gated training commands. They may run
history checks, replay evaluation, sampling-plan validation, doctrine checks,
and report generation only.

After R25S runs, the real approval marker must be consumed with
`allow_additional_runs:false`. Routine gates must then use
`check:r25s-data-first-pilot-history`, which validates ignored artifacts and
reports without invoking training.
