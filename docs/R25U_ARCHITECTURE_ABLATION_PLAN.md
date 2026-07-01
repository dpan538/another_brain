# R25U Architecture Ablation Plan

R25U designs possible future phase 3 ablations; it does not run them. The
purpose is to answer one small question at a time after R25S/R25T showed that
balanced data helped: should the next approved pilot test lower learning rate,
extra depth, wider hidden state, longer context, mild regularization, or another
data-first pass?

Candidate ablations are defined in
`training/from_scratch/architecture_ablation_plan.r25u.json`:

- `same_data_lower_lr`
- `two_layer_same_width`
- `wider_hidden_96`
- `context_128_same_params`
- `regularized_dropout_if_backend_supports`
- `data_first_repeat_if_needed`

Each candidate is disabled by default, requires fresh reviewer approval, writes
only ignored artifacts if ever run later, and remains non-product. None is a
release checkpoint, none is phase_4 scaled training, and none may commit
weights.

The planner may recommend zero or one future ablation. When R25T recommends
architecture ablation, the conservative first design target is
`two_layer_same_width` because it tests depth while keeping the R25S data,
context, and width assumptions mostly stable. This is a recommendation for
future review only.

R25U boundaries:

- no training
- no fourth pilot
- no R25S/R25P/R25M/toy rerun
- no phase_4 scaled training approval
- no product model or release artifact
- no external APIs, remote downloads, backend inference, or external storage
- no chain-of-thought data
- no LoRA, adapters, or fine-tuning as final strategy
- R24/R25 gates remain required

R25V implements the first approved ablation candidate only if a fresh
one-shot approval exists. The selected candidate is `two_layer_same_width`,
mapped to `r25v_two_layer_same_width`. It keeps R25S data selection fixed where
possible and blocks rather than falling back if the local backend cannot run a
real two-layer pilot.
