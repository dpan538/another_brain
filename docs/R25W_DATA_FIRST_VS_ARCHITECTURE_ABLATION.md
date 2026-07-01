# R25W Data-First Vs Architecture Ablation

R25W compares the data-first R25S pilot with the R25V two-layer architecture
ablation. The comparison is evaluation-only and reads existing ignored
artifacts; it does not train or update weights.

R25S remains the best pilot so far when the committed R25V metrics are present:

- R25S used balanced data and lower learning rate.
- R25S improved dev and held-out behavior versus R25P.
- R25V added depth but worsened dev and held-out loss versus R25S.

That outcome favors review, data refinement, or regularization design before
another phase 3 run. It does not justify phase_4 scaled training. It also does
not make R25S or R25V a product model, release checkpoint, or browser static
artifact.

Boundaries remain unchanged:

- future training requires a fresh reviewer approval marker
- approval templates with `approved:false` are inert
- consumed approval markers cannot rerun training
- product and formal training progress remain `0%`
- checkpoints, tokenizer artifacts, generated reports, and model-like binaries
  remain ignored and untracked
- no external APIs, downloads, backend/storage, chain-of-thought data, named
  pretrained model, LoRA, adapters, or fine-tuning final path
