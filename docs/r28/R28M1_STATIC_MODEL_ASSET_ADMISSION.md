# R28M1 Static Model Asset Admission

R28M1 is the first explicitly approved static asset commit for the A12 `new_96m` q4 engineering candidate.

Committed static asset target:

- `web/another_brain/model_assets/r28m1/model.config.json`
- `web/another_brain/model_assets/r28m1/quantization.manifest.json`
- `web/another_brain/model_assets/r28m1/checksums.sha256.json`
- `web/another_brain/model_assets/r28m1/shards/model-q4-*.bin`
- `web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json`

The source A12 checkpoint remains ignored under `artifacts/r27a12/...` in the A12 worktree and is not committed. R28M1 only commits q4 same-origin shards plus runtime metadata and manifests.

Current asset facts:

- Candidate source: `r27a12_new_96m`
- Route: `r28m1_static_q4_engineering_candidate`
- Quantization: `q4`
- q4 bytes: `48,267,968`
- shard count: `5`
- max shard bytes: `12,000,000`
- tokenizer runtime metadata bytes: `938`

Admission boundaries:

- `model_assets_admitted=true` means static q4 assets are present in the repo.
- `product_model_admission=false`.
- `browser_admission=false`.
- `release_checkpoint_admission=false`.
- `phase_4=false`.

Loader smoke verifies same-origin paths, shard sizes, shard sha256, tokenizer metadata presence, and manifest consistency. It does not claim real browser inference or generation quality.
