# R28RT1 Model Architecture

Architecture inspection reads only committed R28M1 metadata:

- `web/another_brain/model_assets/r28m1/model.config.json`
- `web/another_brain/model_assets/r28m1/quantization.manifest.json`
- `web/another_brain/model_assets/r28m1/checksums.sha256.json`
- `web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json`

Detected architecture:

- vocab size: `16000`
- context length: `256`
- layers: `7`
- heads: `14`
- embedding width: `896`
- head dim: `64`
- activation: `gelu`
- norm: `layer_norm`
- positional encoding: learned absolute `pos_emb.weight`
- attention: packed QKV `in_proj_weight`
- lm head: separate `lm_head.weight`
- tensor count: `96`
- q4 packing: `q4_symmetric_per_tensor_with_bool_bitpack`

Tokenizer metadata is not browser decode compatible, so RT1 reports token ids instead of decoded text.
