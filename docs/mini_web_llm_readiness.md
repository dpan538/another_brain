# Mini Web-LLM Readiness

R25 legacy note: this readiness audit is retained for historical comparison and
fallback planning only. It is not static LLM admission and does not define the
final product target. R25 targets a same-origin static browser decoder LLM, not
an expanded SLM/rule-heavy path.

another_brain should be evaluated as a hybrid local runtime, not as a generic chatbot and not as a tiny answer bank.

```text
mini Web-LLM = browser-side local runtime with typed knowledge, reasoning solvers, controlled gate model, verifier, optional compact generation, local cache/profile, and no cloud inference in public runtime.
```

This does not mean the project has already trained a free generator. It means future training and runtime work should be judged by mini Web-LLM readiness: knowledge reserve, reasoning, controlled routing, verifier safety, persona/method separation, license provenance, and browser budget.

## Layer Distinctions

| Layer | Owns | Must not own | Runtime role |
| --- | --- | --- | --- |
| tiny router | route hints, known local answers, low-cost labels | long-tail culture, active reasoning, general knowledge reserve | cheap hint layer and legacy fallback |
| controlled gate | domain, task type, question type, operation, risk, verifier label | final prose generation | control plane for planner/verifier selection |
| culture / knowledge graph | public typed entities, works, periods, movements, relations, themes | answer bank prose, private persona facts | retrieval reserve for culture and factual public metadata |
| solvers | arithmetic, syllogism, transitive comparison, set quantifier | style, culture interpretation | deterministic correctness path |
| persona / method layer | stance, method, boundary, style target | world knowledge, private leakage, source mimicry | answer policy and boundary control |
| verifier | privacy, copyright, source leak, fake coverage, solver conflict | primary knowledge generation | rejects unsafe or unsupported drafts |
| browser profile | bundle size, latency, memory budget, fallback path | training objective | makes local runtime feasible |

## Readiness Metrics

`scripts/eval_mini_web_llm_readiness.mjs` scores:

```json
{
  "knowledge_coverage": 0,
  "reasoning_coverage": 0,
  "culture_graph_coverage": 0,
  "personal_method_layer": 0,
  "verifier_coverage": 0,
  "browser_inference_readiness": 0,
  "license_provenance_readiness": 0,
  "training_depth": 0,
  "blackbox_generalization": 0,
  "runtime_profile_readiness": 0
}
```

The score is deliberately conservative. A high score requires controlled training metrics, source/license gates, browser profile reports, and regression coverage. A green deterministic eval is not enough.

## Current Expected Interpretation

If the report says `deterministic_hybrid_runtime`, the system is still mostly deterministic routing, solvers, cards, gates, and validators.

If it says `hybrid_runtime_with_missing_training_or_browser_profile`, the project has meaningful structure but still lacks one or more of:

- admitted external source registry;
- license/provenance report;
- controlled gate training artifact;
- browser profile budget;
- long-run black-box evidence.

If it says `mini_web_llm_profile_candidate`, the project has a controlled model/gate artifact plus enough safety and browser readiness to consider runtime integration. This still does not imply free-generation training.

## Non-Goals

- Do not train a free generator in public runtime.
- Do not expand answerIndex as a substitute for knowledge reserve.
- Do not import raw corpora, lyrics, private files, source paths, or long copyrighted text.
- Do not let persona/style override factual correctness or solver results.
