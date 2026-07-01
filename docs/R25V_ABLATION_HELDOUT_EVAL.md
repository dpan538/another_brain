# R25V Ablation Held-Out Evaluation

R25V held-out replay evaluates an already-written ignored R25V JSON checkpoint
against R25L held-out rows. It does not train, does not update weights, and
does not use held-out text as training data.

The replay path checks that:

- the checkpoint is replayable JSON under ignored artifacts
- the checkpoint is not product, release, phase_4, or commit-allowed
- R25V used the approved `two_layer_same_width` ablation with actual layer count
  `2` when training ran
- train/dev/held-out splits remain separate
- held-out loss is finite when a replayable checkpoint exists
- blocked mode is explicit when a real two-layer backend is unavailable

Held-out replay loss is a phase 3 mechanics and generalization signal only. It
is not a product benchmark, not release admission, and not evidence that browser
static deployment is ready. R24/R25 gates remain required before any later
training or release decision.
