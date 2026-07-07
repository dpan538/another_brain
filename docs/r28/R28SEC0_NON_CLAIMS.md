# R28SEC0 Non-Claims

R28SEC0 is a static hardening pass only.

It does not claim:

- product model
- product admission
- browser admission
- release admission
- backend inference
- Vercel Function inference
- Edge inference
- external LLM API
- Doubao integration
- hosted vector store
- committed model assets
- committed tokenizer assets
- committed exported shards
- training data promotion
- adapter payload persistence
- context packet persistence
- evidence packet persistence

## Explicit exclusions

This pass does not train, download remote model weights, parse root DOCX/PDF files, parse `data/public_ingestion`, or commit weights/tokenizers/shards.

Forbidden tracked additions remain:

- `artifacts/`
- `*.pt`
- `*.pth`
- `*.safetensors`
- `*.ckpt`
- `*.onnx`
- `*.gguf`
- `tokenizer.json`
- `tokenizer.model`
- `raw_public_samples`
- `clean_public_samples`
- `training_mix`
- `data/public_ingestion`
- root DOCX/PDF files
- adapter/context/evidence payload samples with private content
