# R29B2M MLX daily-dialogue contract

R29B2M is an Apple-silicon, MLX-only research campaign for the existing
approximately 96M Chinese decoder architecture. It runs on the project's
single Apple M1 MacBook Pro with 16 GB unified memory and a 1 TB SSD. It does
not propose or use RTX hardware, Windows, CUDA, a second host, cloud training,
remote inference, or an external LLM API.

The scope is a short Chinese daily-dialogue box: concise greetings, ordinary
short responses, two-to-six-turn referent and constraint handling, correction,
brief rewriting or summarisation, simple planning, and a necessary uncertainty
or clarification response. Context remains 256 tokens and default generation
is capped at 64 tokens. This is not a claim of general knowledge, long-context
agency, coding, multimodality, or high-risk advice capability.

The committed R28M1 q4 bundle is only a **q4-recovered seed**. R29B2M will
strictly validate its manifests and dequantise it for a local MLX seed, but it
will not call that seed an FP32 checkpoint or claim checkpoint-parity evidence.
Its existing browser worker has no multi-token contextual attention or genuine
KV cache; this campaign does not replace that public browser runtime.

Training, if resource, data, resume and generated-behaviour gates pass, uses
assistant-response-only SFT in a single blocking foreground supervisor. All
weights, corpus, checkpoints, generated outputs, wheelhouse and other campaign
artifacts remain ignored. A passing campaign means only
`PASSED_MLX_DIALOGUE_Q4_GATE`; it does not mean browser, product, release or
deployment admission.
