# R25X R25Y Approval Boundary

R25X adds only an inert R25Y approval template:

`training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json`

The template has `approved:false`, blank reviewer, and all training permission
flags set to `false`. It cannot authorize a run.

A future R25Y run would need a separate explicit approval marker with:

- `approved:true`
- matching `run_id` and `variant_id`
- `consumed:false`
- no product-training permission
- no long-term-training permission
- no phase_4 scaled-training permission
- no release-checkpoint permission
- no weight-commit permission

R25X routine gates must remain history/eval/report only. Consumed approval
markers cannot rerun training, and approval templates cannot trigger training.

R25Y, if later approved, would still be phase 3 only. It would not be product
training, phase_4 scaled training, release checkpoint admission, or browser
static deployment.
