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
