# Browser Mini Web-LLM Profile

another_brain remains a local-first browser runtime. Browser readiness is about budget, fallback, and safety, not about adding cloud inference.

## Profiles

| Profile | Includes | Excludes | Intended use |
| --- | --- | --- | --- |
| lite | deterministic rules, tiny router, small cards | controlled gate model, large culture shards, WebGPU generation | fastest public fallback |
| standard | lite plus operation layer, culture graph, solvers, verifier, compact context | free generator, private/PDF-derived facts in public runtime | current target public runtime |
| full | standard plus larger culture shards and controlled gate artifact when safe | cloud inference, raw source text | richer local runtime after training checks |
| web_llm_experimental | full plus WebGPU/WASM model adapter | public default, private source material, unverified weights | local-only research profile |

## Budget Doctrine

- Privacy, copyright, source-leak, verifier, and solver rules are never dropped for bundle budget.
- Low-salience cards may be sharded or lazily loaded.
- The controlled gate can advise domain/task/question/risk, but it must not generate final answers.
- Solvers and hard verifiers override any model/gate suggestion.
- WebGPU/WASM generation remains experimental until browser memory and latency metrics prove safe.

## No-Cloud Guarantee

The public runtime must not depend on cloud inference. If a local profile is too large or unsupported, the fallback is the deterministic lite/standard runtime, not a remote model.

## Current R16 Expectation

The standard profile should fit inside a small static site budget. Larger external metadata reserves should be sharded, reviewed, and excluded from default public runtime until latency and safety checks pass.
