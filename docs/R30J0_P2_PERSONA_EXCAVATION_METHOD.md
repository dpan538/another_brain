# R30J0-P2 Persona Excavation Method

## Scope and state boundary

R30J0-P2 discovers a conditional personal interaction grammar. It does not train a model, alter the existing Judge architecture, freeze an owner profile, authorize R30J1, change production behaviour, call an API, or deploy anything.

The prior `PERSONAL_SOURCE_EVIDENCE_READY` and `HUMAN_OWNER_REVIEW_REQUIRED` states remain historical inputs. Coarse R30J0 axes are hypotheses, not final personality truth. The V1 owner review is paused until its items can be reconciled with P2's conditional grammar.

Actual owner assertions, evidence references, source-derived hypotheses, decisions, edited answers, and review exports are local-only records under the ignored P2 artifact root. Tracked files contain only contracts, empty templates, methodology, and synthetic test fixtures.

## Observable interaction grammar, not personality adjectives

P2 represents a preference as a rule with a positive trigger, negative boundary, context, preferred behaviour, anti-behaviour, intensity, exceptions, register, confidence, evidence, and owner-review state. It asks when a behaviour fits and when it stops fitting. It does not treat a short adjective or a descriptive writing pattern as a global owner preference.

`PersonalInteractionGrammarV1` has eight required layers:

1. `global_boundaries`
2. `register_preferences`
3. `microtraits`
4. `persona_modes`
5. `trigger_rules`
6. `anti_patterns`
7. `exceptions`
8. `confidence_owner_evidence`

Every populated grammar item remains `owner_review_required=true` and `allowed_for_training=false`. The hypothesis grammar and any later owner-approved grammar are separate artifacts; the schema in this phase does not represent a frozen profile.

## Safety and privacy boundary

This method studies observable interaction preference, language behaviour, aesthetic preference, humour strategy, role-play, AI self-presentation, and conversational policy. It must not infer psychological type, clinical state, diagnosis, political or religious identity, sexuality, sensitive demographics, or other sensitive traits.

No raw personal excerpt is a tracked schema field. Evidence is linked by opaque local identifiers. Actual owner-written elicitation answers remain ignored and require a separate privacy review. Even an answer marked safe for persona review is not thereby admitted to training.

The prior broad label `wired` is deprecated as an oversimplification. It is not a model class, persona axis, training label, profile value, microtrait code, or mode code. Any useful behaviour once compressed into that label must be decomposed into observable, conditional hypotheses with evidence and owner review.

## Microtrait contract

`PersonaMicrotraitCatalogV1` records behavioural hypotheses across at least these families: response shape, social stance, epistemic stance, humour strategy, role-play/persona, seriousness switching, explanation strategy, agreement/disagreement, emotional response style, philosophical response style, technical response style, weird-question handling, language/code-switching, opening/closing behaviour, interaction rhythm, AI self-presentation, and anti-patterns.

A populated excavation catalog must contain at least 40 distinct candidates. Sixty to ninety is preferred only when evidence supports that number. Each candidate needs observable behaviour, positive and negative triggers, compatible and forbidden registers, boundary-pair references, evidence route, confidence, and review state. Adjective-only entries are inadmissible.

A normative microtrait needs one of:

- an explicit owner assertion;
- at least three independent historical normative items; or
- at least two evidence items plus owner elicitation confirmation.

Descriptive writing patterns alone remain hypotheses. Codex-generated text has zero owner-evidence weight. Current explicit owner evidence has priority when it conflicts with older evidence, but the conflict stays visible in the contradiction ledger.

## Epistemic persona distinctions

The following categories are distinct and must never be collapsed:

- `REAL_UNCERTAINTY`: the system genuinely lacks adequate support and must communicate that accurately.
- `PLAYFUL_FAUX_IGNORANCE`: a low-stakes, clearly playful performance that does not alter a consequential factual answer.
- `ROLEPLAYED_IGNORANCE`: ignorance expressed inside an identifiable fictional role-play frame.
- `REFUSAL_TO_OVEREXPLAIN`: deliberate brevity or stopping, without pretending the underlying fact is unknown.
- `DEADPAN_MISDIRECTION`: a bounded humour mechanism whose surface direction is intentionally surprising, not a factual uncertainty claim.

The distinction is architectural: playful or role-play behaviour cannot silently overwrite real uncertainty, factual stakes, a serious request, or safety boundaries. An owner-asserted special-mode seed is recorded only in ignored local evidence. Tracked templates do not instantiate it or generalize it.

## Persona mode boundary

`PersonaModeBoundaryV1` requires every candidate mode to supply:

- `trigger_positive` and `trigger_negative`;
- `minimum_confidence`;
- compatible and forbidden registers;
- maximum intensity;
- fallback mode;
- evidence and contradiction counts; and
- should-trigger, may-trigger, and should-not-trigger scenario references.

A mode without a negative boundary is invalid. A boundary can remain `BOUNDARY_NOT_YET_KNOWN`, but a usable candidate record must still contain explicit negative-boundary hypotheses for review. P2 does not implement any mode.

## Register-conditioned coverage

P2 evaluates ordinary chat, casual banter, weird questions, absurd meta-AI conversation, practical advice, technical explanation, debugging, project and academic discussion, philosophy, personal reflection, light emotional language, formal messages, creative play, and role-play.

These are discovery registers, not guaranteed final classes. They may be merged only after evidence. `PersonaCoverageMatrixV1` is intentionally sparse: each microtrait/mode-register cell can be supported, contradicted, unknown, not applicable, or in need of owner review. Blank areas are evidence gaps, not permission to fabricate a global rule.

## Anti-patterns, caricature, and contradictions

`PersonaAntiPatternMapV1` records the transition from a potentially useful behaviour to a harmful caricature. Boundary controls must test where concise becomes empty, direct becomes rude, playful becomes annoying, deadpan becomes cold, reflective becomes pretentious, or a persona becomes a repeated gimmick. Reverse controls are required so that a candidate that looks more personal can plausibly lose.

`PersonaContradictionLedgerV1` preserves both sides of a conflict, their time buckets, possible register/context explanation, and a question for the owner. Contradiction is evidence of conditionality until reviewed; it is not averaged away.

## Owner Persona Elicitation Pack V2

The elicitation contract supports:

- A/B/C choice;
- ranking;
- should/should-not trigger decisions;
- response editing;
- open-ended owner answers;
- mode boundaries;
- blind-repeat consistency;
- `NONE OF THESE`; and
- `IT DEPENDS`, which requires condition text.

Five review sessions target about 190 initial decisions: high-information distinctions, persona modes, weird/mode boundaries, registers/anti-patterns, and open-ended contradictions. Items may satisfy more than one battery, preventing a 700-question wall. Required coverage includes at least 40 harmless weird questions, 24 paired mode-boundary scenarios, 50 generic-good-but-personally-different comparisons, 40 reverse controls, 20–30 open questions, and 30–50 optional prompts answered directly by the owner.

At least 12% of decisions reappear later with altered order or surface wording but the same underlying decision. Consistency is reported globally and by trait family; disagreement is used to find hidden conditions rather than treated automatically as owner error.

Blind repeats preserve a stable `case_id` and canonical option/scenario identifiers while changing display order and surface form. The 190-decision pack contains 166 unique source cases and 24 repeats. Battery floors are evaluated on distinct source cases, not raw tag occurrences. Pair-boundary responses record the decision for scenario A and B independently; a `DEPENDS` choice requires an explicit condition. The local export reports normalized repeat consistency globally and by trait family.

Questions are ranked by expected information gain, particularly normal versus playful, deadpan versus warm, short versus incomplete, unusual versus gimmicky, special mode versus normal, reflective versus pretentious, helpful versus intentionally non-helpful, and assistant-like versus personal.

## Review export and admission

The local review actions are `ACCEPT`, `REJECT`, `EDIT`, `DEPENDS`, and `UNSURE`. `DEPENDS` requires a condition. Review is local-only and may be partially completed. The tracked review-export template contains no decisions or owner answers.

P2 review results remain `allowed_for_training=false`. They do not freeze the grammar or profile. Training becomes discussable only after sufficient elicitation, reconciliation of microtraits, definition of mode boundaries, contradiction review, reconsideration of future Judge outputs, and explicit owner approval.

## Public contract map

| Contract | Purpose | Main record collection |
| --- | --- | --- |
| `PersonalInteractionGrammarV1` | Eight-layer conditional grammar | `layers.*` |
| `PersonaMicrotraitCatalogV1` | Behavioural microtrait hypotheses | `entries` |
| `PersonaAntiPatternMapV1` | Not-efish and caricature boundaries | `entries` |
| `PersonaContradictionLedgerV1` | Conflicting evidence | `entries` |
| `PersonaModeBoundaryV1` | Positive/negative mode boundaries | `modes` |
| `PersonaCoverageMatrixV1` | Sparse register coverage | `rows` / `cells` |
| `OwnerPersonaElicitationPackV2` | Synthetic review stimuli | `session_targets` / `decision_items` / `optional_owner_write_prompts` |
| `OwnerPersonaReviewExportV2` | Ignored local decisions and direct answers | `responses` / `owner_written_responses` |

The corresponding tracked templates are deliberately empty. Actual populated artifacts belong under `artifacts/r30j0/persona_excavation/`, which must remain ignored.
