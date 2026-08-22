# R29B2M-R4H-R2 — Grounded Attention + Style Hybrid Recovery

## Terminal decision

- Campaign state: `BLOCKED_HYBRID_V2_FACTUAL`
- Base commit: `23fc26f25aaa6055aee4ceab62b9f67964c84c49` on `main`
- Previous R4H-R1 terminal: `BLOCKED_HYBRID_VALUE`, unchanged
- Training authorized: `false`
- Signal-head training performed: `false`
- Product, browser runtime, route, deployment, model weights, checkpoint and corpus modifications: none
- Parent checkpoint ID: none; this was an isolated packet/orchestration experiment
- Candidate checkpoint ID: none
- Optimizer tokens: 0
- Assistant target tokens: 0
- Final supervisor/heartbeat: terminal and inactive; child exit code 0

The factual gate has lexical priority. Hybrid V2 produced four unsupported-fact cases and factual/relevance non-regression was 20/30 (66.7%), below the required 98%. Preference, brand, influence and latency cannot override this result.

## Direct R4H-R1 comparison

| Metric | V1 | V2 | Direct delta |
| --- | ---: | ---: | ---: |
| Hybrid overall preference | 50.0% | 33.3% | -16.7 pp |
| Hybrid brand preference | 60.0% | 23.3% | -36.7 pp |
| Factual/relevance non-regression | 80.0% | 66.7% | -13.3 pp |
| Hybrid unsupported-fact cases | 3 | 4 | +1 |

V2 blind preference was 10 Hybrid wins, 16 DeepSeek-only wins and 4 ties. Brand score was higher for Hybrid in 7/30 cases and tied in 16/30. Natural-voice score was higher in 3/30, lower in 7/30 and tied in 20/30. The reviewer was `codex_agent_packet_v2_review_not_human`; all 30 reviews were completed and validated before the arm map was read.

Critical therapy, privacy and identity errors were all zero. This does not rescue the candidate because its two factual gates failed.

## Packet V2 and offline evidence

Packet V2 contains only exact, codepoint-grounded anchors and one style label. The JSON Schema and runtime validator reject additional properties, including affect, dialogue act, emotional rules, response shape and confidence. The compiler emits only literal anchors plus style, while a separate deterministic system policy controls global behavior and response length. Dialogue classification is heuristic, is never a model output, and is used only to select the deterministic length limit.

All 120 public-safe product cases were independently regenerated and reviewed for V2; the paired manifest preserves the exact 30 R4H-R1 case IDs and unchanged user messages. Audit results were:

- Packet valid rate: 100%
- Exact anchor grounding: 100%
- Unsupported packet facts: 0
- Psychological inference: 0
- Extra semantic claims: 0
- Reviewer class: `codex_agent_packet_v2_review_not_human`
- Allowed for training: false

The 30 offline counterfactual compilations made zero DeepSeek requests, separated deterministic policy from the packet, contained no new fact, affect diagnosis or semantic conclusion, and all stayed within the preferred 60-token local-instruction budget (hard limit 100).

R4H-R1 forensics covered the union of all 12 Hybrid losses, all six factual/relevance regressions and all three unsupported-fact cases (14 public-safe cases). It confirms that V1 semantic fields could steer conclusions. V2 removes that authority at the representation boundary; however, the live result shows that literal anchors plus a style imperative can still perturb DeepSeek generation enough to damage factual restraint. Schema safety was necessary but not sufficient.

## Anchor and style value

Packet adherence was 30/30 (100%). Measurable influence was 29/30 (96.7%), and substantive influence was 23/30 (76.7%). These high influence rates are not evidence of value: the influenced arm lost more often and regressed factual/relevance scores in ten cases.

Anchor assessment, conservatively associated rather than causally isolated because this round intentionally ran no field ablation:

- Helped focus: 10/30
- No observable effect: 18/30
- Over-focusing: 1/30
- Wrong implication: 1/30
- Critical anchor failures: 0
- Noncritical anchor failures: 2/30 (6.7%), above the allowed 5%

The anchor result does not authorize a salience head.

Style assessment likewise cannot be isolated from anchors in this paired design. The combined arm was associated with correctness damage in 10 cases, relevance damage in 6 and logical-clarity damage in 3. Blind natural-voice scores improved only 3 times and declined 7 times. Customer-service flags fell from 1 to 0 (100% reduction), but over-explanation flags rose from 2 to 5, a reduction metric of -150%. Style must be redesigned or separately isolated; it is not protected merely to preserve a local-model role.

## Live execution, latency and cost

- Configuration: `deepseek-v4-flash`, thinking disabled, streamed SSE, tools disabled, concurrency 1
- Smoke: 6/6 successful, one request per turn
- Paired run: same frozen 30 cases, 60/60 requests completed in globally randomized order
- Field ablation: 0 requests
- Total live requests: 66/70
- Browser live requests: 0
- Input/output usage: 28,788 / 1,889 tokens
- Conservative estimated spend: CNY 0.011874128 (limit CNY 2)

Paired latency:

| Measure | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: |
| DeepSeek-only TTFT | 594.6ms | 922.4ms | 971.5ms |
| Hybrid V2 TTFT | 694.7ms | 887.5ms | 942.5ms |
| Hybrid V2 completion | 1054.6ms | 1603.7ms | 2617.4ms |
| Oracle packet compilation | 0.014ms | 0.307ms | 2.364ms |

TTFT p95 passed the 5-second gate and completion p95 passed the 8-second gate. Oracle compilation latency is not a claim about an untrained efish head.

Using the required measured-budget formula and a 750ms proxy/browser safety margin:

`5000 - 922.415083 - 750 = 3327.584917ms`

- Recommended local signal p50: 200ms
- Recommended local signal p95: 500ms
- Hard ceiling: 3327.585ms

The prior 800ms figure was not retained. The recommendation uses no more than 20% of measured headroom for p95, capped at 500ms, and 40% of that target for p50, capped at 200ms.

## Training and next-head contract

`training_authorized=false`. Therefore no next head is authorized or proposed for execution in this round.

The only conditional, currently unapproved architecture candidates remain:

1. **Grounded Anchor Salience** — input is the short current user message, with bounded recent context only if later evidence proves it necessary; output is per-token salience probability; post-processing selects exact spans from current user text; the head never generates text.
2. **Style Classifier** — input is the current user message plus bounded conversation state; output is exactly one of `quiet_warm`, `concise_direct`, `reflective`, `playful_light`, `balanced`, or `matter_of_fact`; it produces no other model output.

No affect, emotion intensity, dialogue act, avoid flag, response shape, confidence, local angle or answer-generation head is authorized.

The next-round backbone plan is prepared but not executed: compare frozen probes over (A) the R28M1 q4-recovered base representation and (B) the R3 `stage_a_080k` representation, using uncontaminated family-level splits and end-to-end local latency. Stage A is not presumed better.

## Verification and repository boundary

Post-live verification passed:

- R4H-R2 contract tests: 19/19
- Existing R4H tests: 24/24
- R4H gate mutations: 13/13
- Relevant R2/R3 pytest suites: 62/62
- Hybrid-lab isolation and static-product gates
- Exact existing R28M1 weight gate
- No-eval-hardcoding and secret scan
- Eval split integrity and training provenance (1,379 samples)
- Long-horizon task validation 54/54 and heldout 30/30
- Voice verifier
- Dialogue-boundary 240/240 plus contextual binding, density, deduplication, response-mode, controller and fuzz checks
- `git diff --check`

The ignored `.env.deepseek.local` remained untracked. The secret scan found zero tracked or artifact key matches and zero authorization values. No key characteristic, header or environment dump was recorded.

Only V2 schema/runtime/compiler/policy, public-safe oracle fixtures and aggregate documentation, isolated live harnesses, tests and the narrow V2 lab-isolation allowlist are eligible for commit. Raw responses, blind arm data, request telemetry, secrets and all other live artifacts remain ignored and uncommitted.

Next state: remain `BLOCKED_HYBRID_V2_FACTUAL`. Any further work requires a new explicitly authorized recovery round; do not train either conditional head from this result.
