# Final Endpoint Standard

another_brain is ready when it can interpret turns through a typed NLU control plane, answer within a 3s warm-page SLA using deterministic/tool-first reasoning, sustain 16-turn internal memory with 4-turn visible UI, avoid generic fallback collapse, avoid repair overtrigger, avoid answer repetition, and degrade safely across WebGPU, WASM, and deterministic profiles with zero privacy, copyright, or source leaks.

中文：another_brain 到达成品终点时，必须先用 typed NLU control plane 理解每个 turn，再在 3 秒 warm-page SLA 内用 deterministic/tool-first 路径回答；它要保留 16 轮内部 session memory、只展示 4 轮 UI，避免 generic fallback collapse、repair overtrigger 和重复输出，并能在 WebGPU、WASM、deterministic profiles 之间安全降级，且 privacy、copyright、source leak 均为 0。

## Profiles

| profile | role | cached target | runtime standard | WebGPU | public default |
| --- | --- | ---: | --- | --- | --- |
| lite | deterministic + WASM fallback; no generator | 12-35MB | mobile Safari must work; 4-turn visible UI; 16-turn internal memory | not required | no |
| standard | public default; structured understanding per byte | 45-120MB | warm p95 <= 1.8s; deterministic/tool-first; embedding/rerank/gate/verifier optional | optional assist only | yes |
| full | richer card/rerank/verifier stack; short generator optional and verifier-gated | 120-300MB | warm p95 <= 2.4s; downgrade to standard when benchmark/storage/browser is weak | preferred, not authority | no |
| personal_200m | experimental personal profile | 250-650MB | disabled by default; warm short-answer p95 target <= 2.8s only when benchmark passes | required | no |

## Load Rules

- Public default must not use an autoregressive generator as the main answer path.
- Standard profile may use WebGPU for embedding retrieval, semantic rerank, optional controlled gate acceleration, and optional verifier acceleration.
- Standard profile must remain correct on deterministic/WASM fallback.
- Full and personal profiles must be opt-in and verifier-gated.
- personal_200m remains experimental/off by default until latency, privacy, copyright, license, size, fallback, and validator gates pass.

## Endpoint Readiness

The endpoint standard is a product behavior gate, not a process checklist. Release is blocked when response mode, contextual binding, repair precision, mobile density, duplicate answer rate, privacy/copyright/source boundaries, or 16-turn memory fall below the metric contract.

