# R25AC Chinese Held-Out Eval

R25AC held-out evaluation reads only existing ignored R25AC replay artifacts
and the R25L held-out split. It does not train, rewrite corpus rows, generate
new corpus, call external APIs, download model weights, or write deployable
assets.

## Required Checks

- Replay held-out loss is finite.
- Train/dev/held-out overlap is absent.
- Held-out language buckets are reported for `zh`, `mixed`, and `en`.
- Chinese-first train mix meets `zh >= 0.70` and `en <= 0.10`.
- Personal target coverage is reported for:
  `project_continuation`, `repair_after_weak_answer`,
  `local_first_static_browser_reasoning`, `style_preference`,
  `tool_status_honesty`, and `bounded_judgment`.
- Known-token rate is reported by language, task family, task type, personal
  target, and policy tag where local metadata is available.

## Interpretation

The held-out eval is evidence for whether the bounded micro-cycle stayed
Chinese-primary and aware of project style plus personal-style boundaries. It is
not product readiness, not release admission, and not phase_4 approval. R25S
remains the phase 3 reference pilot until a later review explicitly decides
otherwise.

R25AC artifacts must stay under ignored `artifacts/` paths. No artifacts or
weights from this evaluation may be committed or copied into `web/`,
`static_llm/assets/`, `build_sources/`, or `knowledge_sources/`.
