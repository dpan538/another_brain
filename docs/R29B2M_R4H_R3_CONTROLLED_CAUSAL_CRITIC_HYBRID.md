# R29B2M-R4H-R3 — Controlled Causal Replay and Canonical-Draft Local-Critic Hybrid

## Terminal decision

`BLOCKED_HYBRID_ARCHITECTURE`

Neither controlled one-call steering nor the canonical-draft local-critic path met the required correctness-plus-value contract. Local critic training is not authorized.

- `training_authorized = false`
- `training_started = false`
- `optimizer_tokens = 0`
- `assistant_target_tokens = 0`
- `actual_efish_critic_model_trained = false`
- `oracle_critic = true`
- production UI/API/routes/deployment modified: no
- weights, checkpoints, corpus, raw responses, and telemetry committed: no

The prior R4H-R2 terminal remains `BLOCKED_HYBRID_V2_FACTUAL` and was not modified.

## Existing commit push

Before R3 changes, the clean `main` worktree was verified at `0691d284f64770f7f35baeac1e7110eda9dfa05c`. Its parent was the then-current `origin/main`; the commit was pushed with a normal, non-force push and local `HEAD` was confirmed equal to `origin/main`. No amend, rebase, or force push was used.

## A. Previous V1/V2 evidence

| Metric | V1 | V2 |
|---|---:|---:|
| overall preference | 50.0% | 33.3% |
| brand preference | 60.0% | 23.3% |
| factual/relevance non-regression | 80.0% | 66.7% |
| unsupported facts | 3 | 4 |
| measurable influence | 96.7% | 96.7% |
| substantive influence | 66.7% | 76.7% |

These results remain historical evidence. They are not treated as controlled causal estimates because R1/R2 omitted explicit temperature and changed message structure between arms.

## B. Request-configuration audit

The exact committed R1/R2 construction established:

- `previous_temperature_explicit = false`
- `previous_effective_temperature = 1`, using the documented DeepSeek API default
- `previous_top_p_explicit = false`
- control used one system message
- treatment added a second system message containing local guidance
- previous message structure was therefore confounded

R3 sent `temperature = 0` explicitly on every compared request and never sent `top_p`. The controlled one-call arms used one identical system-message boundary with a fixed `<LOCAL_GUIDANCE>` slot; control supplied `NONE`, while treatment supplied V2 guidance. Model, thinking mode, max tokens, streaming, timeouts, message roles, context, and ordering strategy were otherwise fixed.

## C. Temperature-zero provider residual variance

Twelve frozen public-safe cases were each sent twice as identical controlled DS-only requests: 24 live requests.

- exact text match: 5/12 = 41.7%
- semantic equivalence: 12/12 = 100%
- factual equivalence: 12/12 = 100%
- provider residual semantic/factual variance: 0/12 = 0%
- major wording variance: 5/12 = 41.7%
- unsupported facts across replicate audit: 0

Temperature zero did not produce exact string determinism, but the paired replicates were semantically and factually equivalent. Causal conclusions therefore use semantic/factual comparison rather than exact text identity.

## D. Controlled one-call causal replay

The same 12 cases were run with two arms and two repetitions: 48 requests and 24 blind pairs.

- wins/losses/ties for V2 guidance: 12 / 7 / 5
- overall preference: 12/24 = 50.0%; required diagnostic ≥55%
- brand preference: 12/24 = 50.0%; required diagnostic ≥60%
- factual/relevance relative non-regression: 19/24 = 79.2%; required ≥95%
- conservative absolute factual/relevance-qualified rate: 15/24 = 62.5%
- unsupported facts in Hybrid responses: 7; required 0
- critical regressions: 0
- measurable local influence: 75.0%
- substantive local influence: 33.3%

The diagnostic failed unsupported-fact, factual/relevance, overall-preference, and brand-preference gates. The 30-case expansion was therefore not run. This is the first temperature- and message-structure-controlled causal evidence for one-call V2, and it rejects that architecture.

## E. Canonical-draft critic result

Twenty-four frozen cases used exactly 48 live requests:

1. one efish-independent canonical DeepSeek call;
2. one oracle local critic execution;
3. one hidden constrained-rewrite call;
4. one deterministic semantic guard;
5. release rewrite on pass, otherwise release the exact canonical answer.

The control output reused the exact canonical answer produced for the Hybrid chain. No extra control request was made, and no unvalidated rewrite token was exposed.

Original live/initial-guard result:

- critic execution rate: 24/24 = 100%
- rewrite attempt rate: 24/24 = 100%
- safe rewrite acceptance: 13/24 = 54.2%
- canonical fallback: 11/24 = 45.8%
- accepted-rewrite new unsupported facts versus canonical: 0
- absolute unsupported facts present in accepted final text, inherited from canonical: 9
- factual/relevance relative non-regression: 23/24 = 95.8%; required 100%
- semantic-guard critical false negatives: 0
- semantic-guard noncritical false negatives: 1
- critical regressions versus canonical: 0
- overall preference: 4/24 = 16.7%; required ≥60%
- brand preference: 5/24 = 20.8%; required ≥65%
- natural-voice preference: 5/24 = 20.8%; required ≥65%
- customer-service-tone reduction: 30.0%; required ≥30%
- over-explanation reduction: 14.3%; required ≥25%
- brand improvement among accepted rewrites: 38.5%

The single relative factual/relevance regression removed a real condition: “如果家里有吹风机” became an unconditional dryer instruction. This demonstrated that the initial semantic guard did not protect conditionality.

## F. Semantic-guard replay and fallback

A general conditional-marker preservation rule was added after the live blind evaluation. It is not prompt-specific. Its regression risk is conservative over-rejection when equivalent conditional connectives are substituted.

The already-cached Call-2 candidates were replayed locally with zero new live requests. Initial guard decisions and the original blind review were preserved as authoritative evidence.

- original blind-evaluated acceptance: 13/24 = 54.2%
- original blind-evaluated fallback: 11/24 = 45.8%
- offline strengthened-guard acceptance: 9/24 = 37.5%
- offline strengthened-guard fallback: 15/24 = 62.5%
- changed guard decisions: 4
- fresh blind value review of replay: not performed

The strengthened guard catches the observed condition deletion, but its acceptance rate falls below the 40% target and it creates no new value evidence. It cannot convert the experiment into a pass.

## G. Final-answer-ready latency

- Call-1 completion p95: 2,658.8 ms
- Call-2 completion p95: 1,747.0 ms
- oracle critic p95: 0.44 ms
- semantic guard p95: 7.44 ms
- final-answer-ready p50: 2,515.1 ms; target ≤3,000 ms
- final-answer-ready p95: 4,332.8 ms; target ≤5,000 ms
- final-answer-ready maximum: 4,510.3 ms; hard ceiling ≤8,000 ms

Latency passed. Using the conservative sum of measured p95 components, the remaining future local-critic allowance is about 586.8 ms. The recommended future budget would be p50 ≤250 ms, p95 ≤500 ms, with a hard ceiling of about 586 ms.

## H. Requests and cost

- live requests: 120/200
- input tokens: 26,240
- output tokens: 5,246
- cache-hit input tokens: 9,088
- cache-miss input tokens: 17,152
- estimated cost: USD 0.0038956064
- conservative CNY upper bound used by the hard guard: CNY 0.038956064/2
- concurrency: 1

No one-call expansion or second two-stage live run was performed.

## I. Training decision

`training_authorized = false`.

No local critic, salience head, style head, backbone, Stage B, q4 export, or answer generator was trained. The R28M1-versus-R3 frozen-backbone critic probe is deferred because the architecture did not pass.

## J. Future local-model outputs

No outputs are authorized for training after this result. If a future architecture independently passes correctness and value gates, the only bounded candidate outputs remain:

1. one of the six style classes;
2. multi-label selection from the fixed style-issue vocabulary;
3. optional exact preferred-span selection over the canonical answer.

A future critic must not output affect, user emotion, dialogue act, factual corrections, answer generation, semantic anchor interpretation, or confidence.

## Validation and repository boundaries

- R4H-R3: 23 tests passed
- R4H-R2: 19 tests passed
- R4H: 24 tests passed
- R3/R2 relevant pytest: 62 tests passed in the existing MLX test environment; no training ran
- hybrid lab isolation: passed
- static local product gate: passed
- unapproved weight gate: passed
- no-eval-hardcoding: passed
- split integrity and provenance checks: passed
- voice verifier: passed
- dialogue boundary: 240/240 passed
- long horizon: 24/24 passed
- secret scan: passed
- `git diff --check`: passed

No production surface, API route, deployment configuration, product runtime, model asset, corpus, checkpoint, or secret was added or modified.
