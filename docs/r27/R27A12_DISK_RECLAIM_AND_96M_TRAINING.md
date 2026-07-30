# R27A12 Disk Reclaim And 96M Training

R27A12 reclaims ignored artifact space, selects the largest q4 product-path model that fits the full static 100MB budget, and trains only after disk, MPS, stream, and model-selection gates pass.

## Result

- Candidate route: `product_path_engineering_candidate`
- Selected model: `new_96m`
- Training ran: `True`
- Optimizer tokens: `10240000`
- Wall clock seconds: `35900.461`
- Eval train/dev/heldout loss: `1.0426396375211577` / `0.7341347895562649` / `0.8993318205078443`
- Full static 100MB fit: `True`

R27A12 does not claim a product model, does not approve phase_4, and does not commit weights, tokenizer artifacts, run artifacts, or corpus text.
