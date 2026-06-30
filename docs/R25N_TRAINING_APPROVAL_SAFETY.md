# R25N Training Approval Safety

R25N consumes the historical R25K and R25M one-shot approval markers. They stay
in `training/from_scratch/` as audit records, but they no longer authorize new
training.

Consumed markers must include:

- `consumed: true`
- `allow_additional_runs: false`
- the commit that used the approval
- the phase that used the approval
- a reason saying future runs require a new approval marker

Routine gates must not reuse consumed markers to rerun training. If a training
runner receives an allow flag while only a consumed marker is present, it must
skip with `approval_marker_consumed_new_approval_required`.

Future training requires a new, separate approval marker with `consumed: false`,
a matching `run_id`, the correct narrow scope, no product-training permission,
no long-term-training permission, no release-checkpoint permission, and
`allow_weight_commit: false`.

The approval marker safety gate reports:

- active training approval count
- active product-training approval count
- active weight-commit approval count

For R25N all three must be `0`. This is the lock that prevents R25K/R25M
history from quietly becoming permission for another run.
