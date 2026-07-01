# R25V Architecture Ablation Pilot Run

R25V runs or safely blocks exactly one reviewer-approved phase 3 architecture
ablation pilot: `r25v_two_layer_same_width`, variant `two_layer_same_width`.
It keeps the R25S balanced data strategy fixed where possible and changes only
the small-pilot architecture to a two-layer same-width causal decoder when the
local backend can actually support that model.

R25V is not product training, not long-term training, not phase_4 scaled
training, not release checkpoint admission, and not a browser static artifact.
Product and formal training progress remain `0%`.

The only live approval is
`training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json`. It is a
one-shot approval for `r25v_two_layer_same_width` only. The approval must be
consumed whether the attempt trains, fails safely, or blocks because the local
backend cannot run a real two-layer checkpointed pilot. Future training requires
a new reviewer approval marker.

If the run trains, it writes only ignored artifacts under
`artifacts/training_os/small_decoder_pilot/r25v/`, including a replayable JSON
checkpoint for held-out evaluation. The checkpoint is still not commit-allowed,
not a release checkpoint, not a production artifact, and not static LLM
admission.

R25V boundaries:

- no external APIs or remote downloads
- no dependency installation
- no tracked weights or generated artifacts
- no chain-of-thought or private data
- no eval prompt training
- no backend inference or external storage
- no LoRA, adapters, or fine-tuning as final strategy
- phase_4 remains blocked until exit criteria and fresh reviewer approval pass
