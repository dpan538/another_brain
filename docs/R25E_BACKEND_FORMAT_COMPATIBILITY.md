# R25E Backend Format Compatibility

R25E classifies local artifacts before any production admission attempt.

| Format | Current status |
| --- | --- |
| `fixture` | Supported only for tests; never production performance. |
| `webllm_mlc_candidate` | Candidate only; needs real local WebGPU/WebLLM binding. |
| `transformers_js_candidate` | Candidate only; needs local browser decoder support and budget proof. |
| `wasm_runtime_candidate` | Candidate only; runtime file alone does not prove generation. |
| `unsupported_raw_hf_checkpoint` | Not browser-runnable without conversion. |
| `unsupported_gguf_for_browser` | Not accepted without an approved browser GGUF runtime path. |
| `unknown` | Requires metadata and conversion review. |

No external CDN runtime, remote model loading, hosted inference, or Vercel
Function inference is allowed. Browser support must be same-origin static
assets plus browser-side loading and cache.
