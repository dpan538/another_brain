# WebGPU Reasoning Runtime Plan

R25 legacy note: the WebGPU/personal_200m sections below are historical
comparison material. The active target is a same-origin static browser decoder
LLM with R24 verifier/fallback wrapping, not a 100M-200M SLM final product.

WebGPU matters for another_brain because the target product is a browser-side personal mini Web-LLM runtime with no cloud inference in the public profile. GPU acceleration can help local inference paths that are too heavy for the deterministic runtime alone, while keeping session memory and personal context inside the browser.

## Useful WebGPU Roles

- Local browser-side inference for controlled gate, verifier, embeddings, rerank, and optional compact generation.
- Embedding and semantic retrieval over typed culture cards, method cards, subject graph edges, and public metadata shards.
- Reranking retrieved evidence before the planner drafts an answer.
- Controlled gate prediction for domain, task type, question type, operation, risk, memory policy, and runtime profile.
- Verifier inference for fake coverage, source leaks, privacy/copyright risk, and unsupported overclaims.
- Optional compact short-answer generation, only after deterministic retrieval and verifier constraints are assembled.
- Personal model profile support without sending the 16-turn session memory to a remote service.

## What WebGPU Must Not Do

- It must not replace arithmetic, syllogism, transitive comparison, set, or relation-graph solvers.
- It must not replace privacy, copyright, source-license, or source-leak verifiers.
- It must not be required for all users.
- It must not fetch cloud inference.
- It must not train a free generator in the browser.
- It must not leak internal session memory, local paths, PDF/docx text, private facts, or source snippets.

## Candidate Stacks

| Stack | Role | Notes |
| --- | --- | --- |
| WebLLM | experimental compact decoder | Not a public default until latency, memory, license, and verifier gates pass. |
| Transformers.js | encoder/classifier/embedding candidates | Useful for gate/verifier/embedding if model license and bundle budget pass. |
| ONNX Runtime Web WebGPU EP | classifier/verifier/embedding | Good controlled-inference target with WASM fallback. |
| WebNN | future optional backend | Treat as future capability, not a current requirement. |
| WASM fallback | standard fallback | Mandatory when WebGPU is unavailable or too slow. |
| WebWorker isolation | runtime hygiene | Keeps inference off the main thread where possible. |
| OPFS / Cache API / IndexedDB | model/cache storage | Store only approved static model artifacts and public metadata shards. |

## Runtime Profiles

| Profile | WebGPU Role | Fallback |
| --- | --- | --- |
| lite | none | deterministic rules, tiny router, solvers |
| standard | optional embeddings/rerank/controlled gate | WASM or deterministic runtime |
| full | controlled gate + verifier + larger card shards | WASM controlled gate or standard deterministic runtime |
| personal_200m | 100M-200M quantized profile, WebGPU preferred | disabled or degraded to standard when 3s SLA is at risk |
| experimental | WebLLM / compact decoder | local-only, never public default |

## Inference Task Map

- embedding/rerank: culture retrieval and semantic fallback.
- controlled gate: domain/task/question/operation/risk prediction.
- verifier: reject wrong draft, fake coverage, source leak, privacy leak, copyright violation.
- optional compact generator: bounded short answers only, verifier-gated.
- persona method selector: choose method, style, and boundary without storing private values.

## Safety Doctrine

Deterministic solvers and hard verifiers override model output. WebGPU is an accelerator and optional inference backend, not an authority. If it fails, the runtime falls back locally; it never calls a cloud model.
