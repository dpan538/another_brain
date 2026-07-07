# R28TOK1 Exact Tokenizer Runtime

R28TOK1 replaces the RT2 lossy display codec primary path with an exact runtime tokenizer for the static q4 experimental runtime.

Scope:

- No training.
- No model shard changes.
- No raw checkpoint commit.
- No tokenizer training artifact commit.
- Runtime tokenizer asset only.
- No backend tokenizer service.
- No external LLM API, Doubao, or hosted vector store.

Runtime result:

- tokenizer: `exact_runtime_tokenizer`
- tokenizer type: `exact_runtime_bpe`
- vocab size: `16000`
- merge count: `15791`
- runtime asset: `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`
- runtime tokenizer asset bytes: `997450`
- q4 runtime mode: `static_q4_experimental`
- quality status: `quality_not_ready`

The lossy runtime display codec remains available only as an emergency/debug fallback.

R28TOK1 does not approve product, browser, or release admission.
