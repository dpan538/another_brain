# R22 Natural Conversational Surface Contract

This task is not to make the model pass more tests. It is to make the tests
stop teaching the model to sound artificial.

## Problem

another_brain now has a typed control plane, failure banking, family splits,
dialogue-boundary gates, and endpoint checks. The next failure is not simply
"weak knowledge" or "not enough rows." The visible reply can still sound like
the runtime rendered an internal label, rubric, or domain profile into prose.

This is a surface-selection problem. Knowledge, routing, and surface must stay
separate:

- Knowledge layer: what support primitives are available.
- Control layer: what turn function and response mode are selected.
- Surface layer: what minimal visible utterance fits this turn.

## Natural Response Target

A natural response is the smallest utterance that makes the next turn easier
while sounding written for this user and this moment.

Important consequences:

- Shorter is not automatically better.
- Natural does not mean more human-persona, more intimate, or more cheerful.
- Hidden reasoning may remain; visible reasoning should shrink.
- Non-question turns usually need uptake, not explanation.
- `turn_function` decides surface form before content volume.
- If the user did not ask why, do not narrate why by default.
- If a meaningful non-question appears in active context, answer with uptake
  plus one concrete judgment, then stop.

## Descriptive Artificial Response Taxonomy

- `label_to_sentence_artifact`: internal labels become visible sentences.
- `ontology_leakage_without_forbidden_terms`: the answer sounds like a schema
  walk even without forbidden ontology words.
- `eval_keyword_stuffing`: expected keywords leak into the final sentence.
- `generic_bridge_template`: the same bridge skeleton appears across domains.
- `announced_transition`: the answer announces the bridge instead of making it.
- `over_abstract_judgment`: it jumps to concepts before a concrete turn move.
- `fake_depth`: it adds interpretive mass to look thoughtful.
- `explanatory_compression_failure`: reasoning scaffold leaks into the reply.
- `unnatural_acknowledgement`: affect is ceremonially named instead of received.
- `assistant_politeness_residue`: generic assistant thanks/help residue remains.
- `praise_loop`: compliment turns become service-style gratitude loops.
- `thanks_loop`: the answer thanks the user instead of continuing the shared
  topic.
- `domain_profile_template_collapse`: different domains share the same surface
  skeleton.

## Surface-Control Labels

These labels are control/surface contract fields. They do not authorize broad
runtime answer patching by themselves.

### `surface_mode`

- `natural_reply`
- `compact_judgment`
- `reflective_line`
- `factual_short`
- `list_short`
- `boundary_plain`
- `deep_question`

### `reasoning_budget`

- `none`
- `one_step`
- `hidden_two_step`
- `expanded_only_if_user_asks`

### `abstraction_level`

- `concrete`
- `mixed`
- `abstract`

### `bridge_style`

- `none`
- `implicit`
- `explicit`

### `acknowledgment_style`

- `none`
- `minimal`
- `direct`
- `reflective`
- `no_thanks`
- `no_praise_loop`

### `sentence_shape`

- `one_sentence`
- `two_clause`
- `short_list`
- `question_back`

### `stance_strength`

- `none`
- `light`
- `clear`
- `firm`

### `silence_policy`

- `affordance_only_if_low_signal`
- `never_silent_when_active_context`
- `true_silence_allowed`

## Reasoning Budget Shrinkage Policy

### `none`

Default for:

- compliment
- quiet acknowledgment with active context
- short confirmation
- phatic but not empty turns

Surface target: one small conversational move, no visible rationale.

### `one_step`

Default for:

- analogy_statement
- affective_disclosure
- evaluation_request
- interpretive_light_question
- topic_reentry
- simple recommendation_request

Surface target: uptake plus one concrete judgment.

### `hidden_two_step`

Default for:

- abstract_comparison
- law/economics/science explanations
- multi-domain synthesis
- ambiguity resolution
- boundary-sensitive answers

Surface target: compact structured answer, not a reasoning transcript.

### `expanded_only_if_user_asks`

Triggered by:

- "为什么？"
- "展开说"
- "详细一点"
- "比较一下"
- "给我理由"

## Forbidden And Suspicious Surface Patterns

These are not simple banned words. They are high-risk surface patterns. Identity
and safety forbidden terms remain hard failures elsewhere; the patterns below
are suspicious unless the turn explicitly justifies them.

- `可以从.*进入`
- `重点在于`
- `这体现了`
- `本质上`
- `复杂关系`
- `你可以继续问`
- `可以继续问`
- `从另一个角度`
- `更深层次`
- `这是一种`
- `核心在于`
- `不是简单的.*而是`
- `我接住了`
- `我接住这个`
- `谢谢你的认可`
- `我会继续努力`
- `作为一个`
- `我无法真正`
- `这超出了我的能力，但你可以`

Hard surface failures:

- Active non-question turn exits with "你可以继续问."
- Compliment turn becomes a generic thanks loop.
- Analogy turn becomes a long announced bridge.
- Affective disclosure becomes therapy, encyclopedia, or quiet affordance.
- Boundary/identity answer over-personifies or exposes internal ontology.

## Naturalness Eval Protocol

Naturalness-sensitive turns must not rely primarily on exact final answers or
keyword `must_include`.

Prefer:

- bad/better answer-shape pairs;
- natural-language unit tests;
- session rhythm checks;
- anti-template detector;
- abstractness penalty;
- keyword-stuffing audit;
- non-question uptake check;
- active-context no-escape check;
- anchor-vs-sibling delta.

For naturalness-sensitive rows, `must_include` is allowed only for stable
factual anchors or safety boundaries. It must not force words such as "接住",
"更深", or "关系" into ordinary surface prose.

## What Codex Must Not Patch Directly

- Do not add exact answer cards for the failing 16-turn session.
- Do not add entity-specific runtime branches.
- Do not expand answerIndex to simulate naturalness.
- Do not lower thresholds or delete difficult sibling sessions.
- Do not replace artificial formality with generic casual assistant chatter.
- Do not expose more reasoning to look smarter.
- Do not use WebGPU/RAG/QLoRA as a default surface-quality fix.

## Normative Status

The terms MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are normative.

A requirement is not satisfied by documentation or trace labels alone. Every
hard requirement MUST have runtime evidence, audit evidence, or explicit human
review evidence. Missing evidence MUST be reported as `unknown`, never as
`false` or `passed`.

An audit-only command MUST NOT be described as behavior passed. Reports MUST
separate:

- `execution_ok`
- `behavior_ok`
- `audit_only`
- `blocking`
- `baseline_commit`
- `evaluated_commit`

## Surface Authority Boundary

The surface layer is non-authoritative.

It MAY:

- shorten optional explanation;
- choose sentence shape;
- select acknowledgment form;
- reorder already-supported content units;
- realize an implicit bridge from retrieved relation primitives.

It MUST NOT:

- introduce a factual claim not present in content units or evidence;
- change factual polarity, modality, attribution, date, quantity, or entity;
- remove required uncertainty or source-dependence;
- weaken privacy, copyright, identity, safety, legal, medical, or financial boundaries;
- convert a bounded unknown into a confident judgment;
- create a relationship or analogy unsupported by retrieved primitives;
- modify memory-write decisions or response-mode decisions.

If required content cannot fit the selected surface budget, the budget MUST
expand or the current verified answer MUST be retained.

## Semantic Preservation Invariants

Every surface candidate MUST preserve:

- required factual anchors;
- required answer-plan slots;
- negation and polarity;
- uncertainty level;
- source/evidence attribution;
- active referent;
- response type;
- boundary strength;
- recommendation criterion, when one was requested.

Hard failures:

- `semantic_loss_from_compression`
- `over_short_empty_reply`
- `unsupported_stance`
- `surface_synonym_evasion`
- `content_surface_drift`
- `boundary_dilution`
- `uncertainty_erasure`
- `false_concreteness`
- `forced_acknowledgment`
- `naturalness_by_deletion`
- `factual_polarity_change`
- `dropped_uncertainty`
- `dropped_boundary`
- `wrong_active_referent`
- `invented_bridge`
- `invented_fact`
- `surface_candidate_more_confident_than_source`

Naturalness MUST NOT be obtained by deleting useful specificity.

## Visible Explanation Budget Semantics

`reasoning_budget` controls visible explanation, not internal decision quality.
It should be interpreted as `visible_explanation_budget`.

Allowed values:

- `none`
- `one_step`
- `compact_two_step`
- `hidden_two_step`
- `expanded_only_if_user_asks`

`none` means no visible rationale. Internal routing, verification, retrieval,
and safety checks still run.

`expanded_only_if_user_asks` controls visible expansion only. It MUST NOT
disable internal reasoning on difficult or high-stakes turns. Expansion triggers
MUST be semantic, not limited to exact strings such as "为什么" or "展开说".

## Label Normalization

Positive control axes and negative prohibitions MUST remain separate.

`acknowledgment_mode`:

- `none`
- `minimal`
- `direct`
- `reflective`

`surface_prohibitions`:

- `generic_thanks`
- `praise_loop`
- `announced_bridge`
- `taxonomy_language`
- `assistant_escape`
- `unsupported_intimacy`

`no_thanks` and `no_praise_loop` MUST NOT be treated as acknowledgment modes.
`natural_reply` MUST NOT be used as an unrestricted catch-all. Each turn
function MUST declare allowed and disallowed surface modes.

## Signal And Response Obligation

Non-question turns MUST be classified by signal level:

- `phatic_low`
- `meaningful`
- `task_relevant`
- `boundary_relevant`

Response behavior:

- `phatic_low`: silence, affordance, or minimal acknowledgment MAY be valid;
- `meaningful`: a response is normally required;
- `task_relevant`: a grounded response is required;
- `boundary_relevant`: a boundary response is required.

`never_silent_when_active_context` MUST NOT be applied merely because context
exists. The system MUST distinguish meaningful disclosure from ordinary
backchanneling.

## Confidence And Safe Fallback

Every surface candidate MUST output:

- `surface_confidence`
- `content_units_used`
- `required_units_preserved`
- `evidence_ids`
- `dropped_optional_units`
- `prohibition_hits`
- `fallback_reason`

The candidate MUST fall back to the current verified answer when:

- confidence is below the declared threshold;
- required units are missing;
- evidence is insufficient;
- any hard surface invariant fails;
- the candidate is more confident than its evidence;
- a safety or identity boundary may have changed;
- the candidate introduces a new entity or relation.

Fallback is not a naturalness failure. Unsafe or semantically lossy rewriting is.

## Structural Anti-Template Enforcement

Forbidden phrase detection is diagnostic only and MUST NOT be the sole test.

The audit MUST also detect:

- repeated syntactic skeletons;
- repeated discourse plans;
- domain-profile slot substitution;
- synonym evasions of forbidden templates;
- repeated "acknowledge + abstract noun + continue" structures;
- repeated "not X but Y" contrast structures;
- repeated overview/recommendation/deepening frames across sibling domains.

Replacing a forbidden phrase with a synonym while preserving the same artificial
surface skeleton counts as failure. Quoted user text, linguistic analysis, and
explicit discussion of a phrase MAY be exempt, but the exemption MUST be
traceable.

## Runtime Isolation

Runtime code MUST NOT import or read:

- eval fixtures;
- bad/better answer examples;
- review-sheet answers;
- blind-session expected outputs;
- documentation examples.

No `better_answer_shape` may become runtime training or answer data without a
separate reviewed data-governance decision.

## Legacy Debt Rule

Existing full-sentence domain profiles are legacy debt. They MAY remain
temporarily only when marked:

- `legacy_surface_only: true`
- `authoritative_knowledge: false`
- `migration_pending: true`

No new full-sentence domain profile fields may be added. New code MUST NOT
increase:

- entity-specific runtime branches;
- exact-prompt logic;
- full-answer sentence count;
- repeated domain-profile skeleton count.

Legacy exceptions apply only to existing lines at the frozen baseline commit.
They do not authorize new debt.

## Blind And Human Review

Natural-surface promotion requires:

1. anchor-session review;
2. independently authored blind sibling review;
3. randomized A/B order;
4. reviewer blindness to current vs candidate;
5. factual and boundary regression review;
6. review of cases where the candidate is shorter but less useful;
7. review of cases where the candidate becomes colder, emptier, or more generic.

No automated metric, regex detector, or LLM judge may independently authorize
production promotion. Anchor-only improvement is insufficient.

## High-Stakes Carve-Out

For law, medicine, finance, self-harm, privacy, copyright, current institutional
facts, and other source-sensitive topics:

- factual and boundary correctness overrides natural brevity;
- jurisdiction/date/source caveats MUST be preserved;
- surface compression MUST NOT remove qualifications;
- source dependence MUST remain visible when needed;
- the surface layer MUST default to verified current-answer fallback when uncertain.

## Hard Completion Conditions

R22 natural surface is not complete merely because:

- pattern counts decline;
- answers become shorter;
- five known cases pass;
- a strict script exits zero;
- bad phrases are replaced with synonyms;
- an anchor improves;
- more surface labels are emitted.

Completion requires:

- no new entity-specific or exact-prompt branches;
- no semantic-preservation failures;
- no factual, safety, privacy, copyright, or identity regressions;
- demonstrated improvement on blind sibling sessions;
- no anchor-only gain;
- no increase in empty or overly terse answers;
- no increase in unsupported judgment;
- human approval of randomized A/B review;
- deployed parity after an explicitly approved live switch.
