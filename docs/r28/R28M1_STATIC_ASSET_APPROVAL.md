# R28M1 Static Asset Approval

R28M1 uses committed approval metadata at `data/training_registry/r28m1_static_asset_commit_approval.json`.

The approval is intentionally narrow. It allows only:

- A12 `new_96m` q4 quantized static shards.
- Runtime tokenizer metadata asset.
- Model config.
- Quantization manifest.
- Shard checksum manifest.
- Asset manifest metadata.
- Tests, docs, and scripts.

It does not approve:

- Raw checkpoint commit.
- Unquantized weights.
- Optimizer state.
- Training artifacts.
- Training corpus.
- Future models.
- Product admission.
- Browser admission.
- Release checkpoint admission.
- `phase_4`.

`scripts/r28m1_check_asset_commit_approval.py` must pass before any static model assets are generated or committed.
