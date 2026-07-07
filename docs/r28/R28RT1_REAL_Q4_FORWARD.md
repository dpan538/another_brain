# R28RT1 Real Q4 Forward

R28RT1 implements the first minimal real q4 decoder forward path for the committed R28M1 static assets.

Implemented path:

- same-origin R28M1 asset manifest load
- q4 shard checksum verification before use
- tensor metadata and global byte offset resolution
- q4 symmetric per-tensor dequant helpers
- CPU/JS vector x matrix kernels
- LayerNorm with bias
- single-token packed-QKV attention path
- GELU MLP path
- final LayerNorm and lm_head logits projection
- greedy next-token-id selection

Result:

- real q4 forward passed: yes
- generated token ids: `4`
- natural text decode: no
- tokenizer blocker: `runtime_tokenizer_not_browser_compatible_for_text_decode`

R28RT1 closes `q4_model_forward_not_implemented` for minimal token-id inference only. It does not make product, browser admission, release, or answer-quality claims.
