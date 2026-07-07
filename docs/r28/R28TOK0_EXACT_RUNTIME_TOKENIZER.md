# R28TOK0 Exact Runtime Tokenizer

R28TOK0 replaces the RT2 lossy runtime display codec primary path with an exact runtime BPE tokenizer for the committed R28M1 static q4 engineering candidate.

## Scope

- No training.
- No new model weights, shards, checkpoints, ONNX, or GGUF assets.
- No backend inference.
- No external LLM API, Doubao, or hosted vector store.
- No product, browser, or release checkpoint admission.

## Runtime Asset

- Path: `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`
- Type: `exact_runtime_bpe`
- Vocab size: `16000`
- Merge count: `15791`
- Asset bytes: `997419`
- Same-origin path: yes

The existing lineage metadata file remains at `web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json`. Runtime loading now uses the exact tokenizer asset first; the metadata file remains for lineage and non-claim context.

## Runtime Behavior

- `static_q4_experimental` uses exact tokenizer encode/decode by default.
- Prompt text is encoded with the runtime BPE tokenizer.
- Generated token ids are decoded through the exact vocab.
- The old lossy display codec remains only as an emergency debug fallback.
- UI/runtime metadata reports `tokenizer_decode_status=exact_runtime_tokenizer`.

## Non-Admission

Exact tokenizer compatibility does not admit model quality, browser readiness, product readiness, or release readiness. Manual QA and later admission gates remain required.
